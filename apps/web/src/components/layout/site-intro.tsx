/**
 * First-visit intro: the VALTA.LK wordmark on a dark screen with a thin orange line drawing under it, then a fade into
 * the site (like a splash screen). It is server-rendered, so it covers the page from the first paint with no flash, and it
 * dismisses itself with CSS alone (about 1.6 s), so it never depends on JavaScript.
 *
 * Shown once per browser: the inline script right after it marks the browser as having seen it and, on later visits,
 * hides it before it is painted. Hidden from assistive tech, and skipped with reduced motion (see .site-intro in
 * globals.css). The page underneath renders normally, so content and SEO are unaffected.
 */
const KEY = "valta.intro.v1";
const SCRIPT = `try{var e=document.getElementById("site-intro");if(localStorage.getItem("${KEY}"))e.setAttribute("data-seen","");else localStorage.setItem("${KEY}","1")}catch(_){}`;

export function SiteIntro() {
  return (
    <>
      {/* suppressHydrationWarning: the script below may add data-seen before React hydrates. */}
      <div id="site-intro" aria-hidden className="site-intro" suppressHydrationWarning>
        <div className="site-intro-stage">
          <span className="site-intro-glow" />
          <span className="site-intro-ring" />
          <p className="site-intro-mark font-display font-extrabold tracking-[-0.02em]">
            <span>V</span>
            <span className="text-brand-500">Λ</span>
            <span>LTA</span>
            <span className="text-[0.82em]">.LK</span>
          </p>
          <span className="site-intro-line" />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
