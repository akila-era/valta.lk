/**
 * Intro screen: the VALTA.LK wordmark on a dark screen with a thin orange line drawing under it, then a fade into the
 * site (about 1.7 s). Hidden by default; the inline script right after it switches it on (data-show) before the first
 * paint, and only:
 *   - when the homepage is loaded or refreshed, and
 *   - on the first page of a visit (browser tab session) when someone arrives on another page.
 * It lives in the root layout, which navigation never re-renders, so pages reached by a link never show it; admin pages
 * (/admin) never show it either. It dismisses itself with CSS alone, is hidden from assistive tech, and is skipped with
 * reduced motion (see .site-intro in globals.css). The page underneath renders normally, so content and SEO are unaffected.
 */
const KEY = "valta.intro.arrived";
const SCRIPT = `try{var e=document.getElementById("site-intro"),s=sessionStorage,p=location.pathname;if((p+"/").indexOf("/admin/")!==0){if(p==="/"||!s.getItem("${KEY}"))e.setAttribute("data-show","");s.setItem("${KEY}","1")}}catch(_){}`;

export function SiteIntro() {
  return (
    <>
      {/* suppressHydrationWarning: the script below adds data-show before React hydrates. */}
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
