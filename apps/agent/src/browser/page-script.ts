/**
 * The JavaScript that runs INSIDE the browser page, in an ISOLATED world named "volta-guard". Isolated means the page's own scripts cannot see
 * or change anything defined here (functions, the element registry, prototypes), while both worlds share the same DOM and the same events.
 * It is installed with Page.addScriptToEvaluateOnNewDocument, so it runs before any script of the page.
 *
 * What it provides (the driver calls these; the model never supplies script):
 *   collect()  one snapshot: visible text (text a shopper cannot see is left out), the interactive elements, and a REGISTRY that remembers
 *              each element object and its fingerprint (tag, role, type, accessible name, link target) under its reference.
 *   arm()/disarm()  before a real mouse click: re-check the registered element against its fingerprint, scroll it into view, make sure
 *              nothing covers its centre, and arm a capture-phase guard on window. The guard runs BEFORE every page handler and cancels
 *              pointer, mouse and click events whose target is not exactly the armed element in the armed state. So a page that swaps the
 *              button after the snapshot, or in the middle of the click, never receives the click.
 *   fill()/select()  check and act in ONE synchronous call: no page code can run between the check and the action.
 * Element references are never page attributes (the page cannot move them): they are keys into the registry here.
 *
 * Plain JavaScript on purpose (no transpiler helpers can leak into the page). Written without backticks and without dollar-brace so that it can
 * live in a TypeScript template literal.
 */
export const GUARD_WORLD = "volta-guard";

export const GUARD_SOURCE = String.raw`(function () {
  if (globalThis.__volta) return;
  const v = (globalThis.__volta = { gen: 0, els: new Map(), fps: new Map(), armed: null });
  const squash = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const tagOf = (el) => el.tagName.toLowerCase();
  const typeOf = (el) => (tagOf(el) === 'input' ? String(el.type || 'text').toLowerCase() : '');
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = tagOf(el), type = typeOf(el);
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (type === 'search') return 'searchbox';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    return 'textbox';
  };
  const nameOf = (el) => {
    const tag = tagOf(el), type = typeOf(el);
    let name = el.getAttribute('aria-label');
    if (!name) { const by = el.getAttribute('aria-labelledby'); if (by) name = by.split(/\s+/).map((id) => { const t = document.getElementById(id); return t ? t.textContent : ''; }).join(' '); }
    if (!name && el.labels && el.labels.length) name = el.labels[0].textContent;
    if (!name && tag !== 'input' && tag !== 'textarea' && tag !== 'select') name = el.innerText || el.textContent;
    if (!name) name = el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || (['button', 'submit', 'reset'].includes(type) ? el.value : '') || el.getAttribute('name') || '';
    return squash(name, 200);
  };
  const fpOf = (el) => ({ tag: tagOf(el), role: squash(roleOf(el), 30), type: typeOf(el), name: nameOf(el), href: tagOf(el) === 'a' && el.href ? String(el.href).slice(0, 2048) : '' });
  const FP_KEYS = ['tag', 'role', 'type', 'name', 'href'];
  const sameFp = (a, b) => FP_KEYS.every((k) => a[k] === b[k]);

  // ---- text a shopper can actually see
  const parseColor = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(String(c).trim());
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1 };
  };
  const lum = (c) => { const f = (x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const backgroundOf = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a >= 0.9) return bg;
      if (bg && bg.a > 0) return null;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'OPTION', 'HEAD', 'TITLE']);
  const elState = new Map();
  // Why an element's text is invisible to a person (own style plus what it inherits from its ancestors), or '' when it is visible.
  const hiddenWhy = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (elState.has(el)) return elState.get(el);
    const parentWhy = el.parentElement ? hiddenWhy(el.parentElement) : '';
    let why = parentWhy;
    if (!why) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') why = 'display';
      else if (cs.visibility === 'hidden' || cs.visibility === 'collapse') why = 'visibility';
      else if (parseFloat(cs.opacity) < 0.1) why = 'opacity';
      else if (parseFloat(cs.fontSize) < 2) why = 'fontsize';
      else if (/^inset\(\s*(?:100|[5-9][0-9])(?:\.[0-9]+)?%/.test(cs.clipPath || '') || /^circle\(\s*0/.test(cs.clipPath || '')) why = 'clippath';
      else if (/^rect\(\s*0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?\s*\)$/.test(cs.clip || '') && (cs.position === 'absolute' || cs.position === 'fixed')) why = 'clip';
      else if (parseFloat(cs.textIndent) < -999) why = 'textindent';
      else {
        const fg = parseColor(cs.color);
        if (fg && fg.a < 0.1) why = 'transparent';
        else if (fg) {
          const bg = backgroundOf(el);
          if (bg) {
            const a = lum(fg), b = lum(bg);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < 1.1) why = 'contrast';
          }
        }
      }
    }
    elState.set(el, why);
    return why;
  };
  const hiddenByGeometry = (node, el) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.prototype.filter.call(range.getClientRects(), (r) => r.width >= 1 && r.height >= 1);
    if (!rects.length) return 'norect';
    const sx = window.scrollX || 0, sy = window.scrollY || 0;
    const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const onPage = rects.filter((r) => !(r.right + sx <= 0 || r.bottom + sy <= 0 || r.left + sx >= docW));
    if (!onPage.length) return 'offscreen';
    // An ancestor that clips its overflow and does not overlap the text at all shows none of it (zero height, or text pushed outside).
    for (let a = el; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const clips = (o) => o === 'hidden' || o === 'clip';
      if (!clips(cs.overflowX) && !clips(cs.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      const inside = onPage.some((r) => r.right > ar.left + 0.5 && r.left < ar.right - 0.5 && r.bottom > ar.top + 0.5 && r.top < ar.bottom - 0.5);
      if (!inside) return 'clipped';
    }
    return '';
  };
  const isBlock = (el) => { const d = getComputedStyle(el).display; return d !== 'inline' && d !== 'contents' && d !== 'inline-block'; };
  const blockOf = (el) => { let n = el; while (n && n.parentElement && !isBlock(n)) n = n.parentElement; return n; };
  const visibleText = (maxText) => {
    const out = [];
    elState.clear();
    let len = 0, dropped = 0, sample = '', lastBlock = null, seen = 0;
    if (!document.body) return { text: '', dropped: 0, sample: '' };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    for (let node = walker.nextNode(); node && len < maxText && seen < 30000; node = walker.nextNode()) {
      const raw = node.nodeValue || '';
      if (!/\S/.test(raw)) continue;
      seen++;
      const el = node.parentElement;
      if (!el) continue;
      let skip = false;
      for (let a = el; a; a = a.parentElement) if (SKIP.has(a.tagName)) { skip = true; break; }
      if (skip) continue;
      const why = hiddenWhy(el) || hiddenByGeometry(node, el);
      const piece = raw.replace(/\s+/g, ' ').trim();
      if (why) { dropped++; if (sample.length < 500) sample += (sample ? ' | ' : '') + piece.slice(0, 120); continue; }
      const block = blockOf(el);
      out.push((out.length === 0 ? '' : block === lastBlock ? ' ' : '\n') + piece);
      lastBlock = block;
      len += piece.length + 1;
    }
    return { text: out.join('').slice(0, maxText), dropped, sample: sample.slice(0, 500) };
  };

  // ---- snapshot and registry
  v.collect = function (maxText, maxEls) {
    const gen = ++v.gen;
    v.els = new Map();
    v.fps = new Map();
    const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=textbox],[role=searchbox],[role=combobox],[role=checkbox],[role=tab],[role=menuitem]';
    const nodes = document.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < nodes.length && out.length < maxEls; i++) {
      const el = nodes[i];
      const tag = tagOf(el), type = typeOf(el);
      if (type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
      const fp = fpOf(el);
      const ref = 'e' + gen + '-' + out.length;
      v.els.set(ref, el);
      v.fps.set(ref, fp);
      const item = { ref, tag, role: fp.role, name: fp.name, enabled: !el.disabled && el.getAttribute('aria-disabled') !== 'true', visible };
      if (fp.href) item.href = fp.href;
      if (tag === 'input') item.inputType = type;
      if ((tag === 'input' && type !== 'password' && type !== 'file' && type !== 'hidden') || tag === 'textarea') item.value = squash(el.value, 200);
      else if (tag === 'select') item.value = squash(el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : '', 200);
      out.push(item);
    }
    const cartEl = document.querySelector('[data-cart-count]');
    const cart = cartEl ? parseInt(cartEl.getAttribute('data-cart-count'), 10) : NaN;
    const vt = visibleText(maxText);
    return JSON.stringify({
      title: squash(document.title, 300),
      text: vt.text,
      hiddenDropped: vt.dropped,
      hiddenSample: vt.sample,
      ready: document.readyState === 'complete',
      cartCount: Number.isFinite(cart) && cart >= 0 && cart < 10000 ? cart : null,
      scrollY: Math.round(window.scrollY || 0),
      elements: out,
    });
  };

  // The registered element for a reference, only while it is still the SAME kind of thing the tool layer classified.
  const resolve = (ref) => {
    const el = v.els.get(ref), fp = v.fps.get(ref);
    if (!el || !fp) return { why: 'unknown' };
    if (!el.isConnected) return { why: 'detached' };
    if (!sameFp(fpOf(el), fp)) return { why: 'changed' };
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return { why: 'disabled' };
    return { el, fp };
  };

  // ---- the click guard
  const GUARDED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'];
  for (const t of GUARDED) {
    window.addEventListener(t, function (ev) {
      const a = v.armed;
      if (!a) return;
      const ok = (ev.target === a.el || a.el.contains(ev.target)) && a.el.isConnected && sameFp(fpOf(a.el), a.fp);
      if (ok) { a.seen++; return; }
      a.violations++;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }, true);
  }
  v.arm = function (ref) {
    v.armed = null;
    const r = resolve(ref);
    if (!r.el) return JSON.stringify({ ok: false, why: r.why });
    r.el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = Array.prototype.find.call(r.el.getClientRects(), (q) => q.width >= 1 && q.height >= 1);
    if (!rect) return JSON.stringify({ ok: false, why: 'notvisible' });
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return JSON.stringify({ ok: false, why: 'offscreen' });
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === r.el || r.el.contains(hit))) return JSON.stringify({ ok: false, why: 'covered' });
    v.armed = { el: r.el, fp: r.fp, violations: 0, seen: 0 };
    return JSON.stringify({ ok: true, x, y });
  };
  v.disarm = function () {
    const a = v.armed;
    v.armed = null;
    // armed:false means this world never armed anything: the page navigated after the click and this is a fresh document's world.
    return JSON.stringify(a ? { armed: true, violations: a.violations, seen: a.seen } : { armed: false, violations: 0, seen: 0 });
  };

  // ---- fields (check and act in one synchronous call)
  v.fill = function (ref, text, submit) {
    const r = resolve(ref);
    if (!r.el) return JSON.stringify({ ok: false, why: r.why });
    const tag = r.fp.tag, type = r.fp.type;
    if (!(tag === 'input' || tag === 'textarea') || type === 'password' || type === 'file' || type === 'hidden' || !['textbox', 'searchbox', 'combobox'].includes(r.fp.role)) return JSON.stringify({ ok: false, why: 'notfield' });
    if (r.el.readOnly) return JSON.stringify({ ok: false, why: 'readonly' });
    r.el.focus();
    const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(r.el, text);
    r.el.dispatchEvent(new Event('input', { bubbles: true }));
    r.el.dispatchEvent(new Event('change', { bubbles: true }));
    if (submit) {
      const f = r.el.form;
      if (!f) return JSON.stringify({ ok: false, why: 'noform' });
      f.requestSubmit();
    }
    return JSON.stringify({ ok: true });
  };
  v.select = function (ref, option) {
    const r = resolve(ref);
    if (!r.el) return JSON.stringify({ ok: false, why: r.why });
    if (r.fp.tag !== 'select') return JSON.stringify({ ok: false, why: 'notselect' });
    if (r.el.multiple) return JSON.stringify({ ok: false, why: 'multiple' });
    const want = squash(option, 200).toLowerCase();
    let idx = -1;
    for (let i = 0; i < r.el.options.length; i++) {
      const o = r.el.options[i];
      if (!o.disabled && squash(o.text, 200).toLowerCase() === want) { idx = i; break; }
    }
    if (idx < 0) return JSON.stringify({ ok: false, why: 'nooption' });
    r.el.selectedIndex = idx;
    r.el.dispatchEvent(new Event('input', { bubbles: true }));
    r.el.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({ ok: true });
  };
})();`;
