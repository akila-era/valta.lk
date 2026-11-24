"use client";

import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "./mobile-menu";

/**
 * Phone-only search icon in the header. As on ugreen.lk it opens the menu drawer from the left with the search box
 * focused, popular requests and the category list (the drawer itself lives in MobileMenu).
 *
 * Phones (iPhone in particular) only open the on-screen keyboard when a text field is focused during the tap itself.
 * The drawer renders a moment later, so the tap first focuses a hidden stand-in field; the drawer then moves the focus
 * to its own search box and the keyboard stays open.
 */
export function MobileSearch() {
  const open = () => {
    const stand = document.createElement("input");
    stand.type = "search";
    stand.setAttribute("aria-hidden", "true");
    stand.tabIndex = -1;
    stand.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;";
    document.body.appendChild(stand);
    stand.focus({ preventScroll: true });
    window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
    setTimeout(() => stand.remove(), 1000);
  };
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open search"
        aria-haspopup="dialog"
        onClick={open}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink transition-colors hover:text-brand-600"
      >
        <Search className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
