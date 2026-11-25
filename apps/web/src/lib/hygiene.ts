/** UI-side data hygiene: hide test/placeholder data and never show raw slugs as labels. */

/** True for keyboard-mash or test names such as "jhhj" or "asasasa". Real short names (LG, JBL, HP) pass. */
export function looksLikeJunk(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  const letters = t.replace(/[^a-z]/gi, "");
  if (/\b(test|testing|dummy|lorem|ipsum|asdf|qwer|sample|xxx+)\b/i.test(t)) return true;
  if (letters.length >= 4 && letters.length === t.replace(/\s/g, "").length) {
    if (letters.length <= 8 && !/[aeiouy]/i.test(letters)) return true;
    if (letters.length >= 5 && /^(.{1,3})\1+.{0,2}$/i.test(letters)) return true;
    if (new Set(letters.toLowerCase()).size <= 2) return true;
  }
  return false;
}

/** "mobile-phones" or "MOBILE_PHONES" becomes "Mobile Phones"; proper names pass through unchanged. */
export function prettyLabel(name: string): string {
  const n = name.trim();
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(n) || /^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(n)) {
    return n.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  return n;
}

interface CategoryLike {
  name: string;
  count: number;
  subs?: { name: string }[];
}

/** Categories with products and a real name; labels cleaned. Sub-categories get the same junk check. */
export function cleanCategories<T extends CategoryLike>(list: T[]): T[] {
  return list
    .filter((c) => c.count > 0 && !looksLikeJunk(c.name))
    .map((c) => ({
      ...c,
      name: prettyLabel(c.name),
      ...(c.subs ? { subs: c.subs.filter((s) => !looksLikeJunk(s.name)).map((s) => ({ ...s, name: prettyLabel(s.name) })) } : {}),
    }));
}

/** Logs the banner and hides it when any visible text is placeholder junk. */
export function bannerIsClean(b: { id?: string; headline: string; eyebrow?: string | null; text?: string | null; ctaLabel?: string | null }): boolean {
  const bad = [b.headline, b.eyebrow, b.text, b.ctaLabel].some((t) => t && looksLikeJunk(t));
  if (bad) console.warn(`[banner] hidden: placeholder text in banner ${b.id ?? b.headline}`);
  return !bad;
}
