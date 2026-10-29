"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Eye, X } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";
import { formatLkr } from "@/lib/utils/money";
import { AddToCartButton } from "./add-to-cart-button";
import { WishlistButton } from "./wishlist-button";

/** What the quick view needs: a slim, serialisable copy of the card's product (no full ERP record in the page). */
export interface QuickViewProduct {
  id: string;
  slug: string;
  name: string;
  title: string;
  sku?: string;
  label?: string | null;
  images: string[];
  price: number;
  current: number;
  save: number;
  available: boolean;
  hasVariants: boolean;
  /** Real ERP stock: "Only N left" when 5 or fewer. 0 = not shown. */
  low: number;
  summary?: string;
  details: { value: string; name: string }[];
}

/**
 * The eye button on a product card and the quick view it opens: the photos, price, stock, key details and Add to cart
 * in a window over the page, so shoppers can look at several products without leaving the list. Products with options
 * send the shopper to the product page to choose. Keyboard: focus moves into the window, Tab stays inside, Escape
 * closes it and focus returns to the eye button.
 */
export function QuickView({ product }: { product: QuickViewProduct }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDialogLifecycle(open, close, panel);
  const href = `/products/${product.slug}`;
  const titleId = `qv-${product.id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShown(0);
          setOpen(true);
        }}
        aria-label={`Quick view: ${product.title}`}
        title="Quick view"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg text-ink transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-white"
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
              <button type="button" tabIndex={-1} aria-label="Close quick view" onClick={close} className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/55 backdrop-blur-xs" />
              <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 grid max-h-[92svh] w-full max-w-4xl animate-[added-in_0.25s_cubic-bezier(0.2,0.7,0.2,1)] overflow-y-auto rounded-t-panel bg-bg text-ink shadow-overlay sm:rounded-panel md:grid-cols-2"
              >
                <button type="button" onClick={close} aria-label="Close quick view" className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink hover:bg-brand-500 hover:text-white">
                  <X className="h-5 w-5" aria-hidden />
                </button>

                {/* Photos */}
                <div className="border-b border-border p-5 md:border-b-0 md:border-r">
                  <div className="relative aspect-square overflow-hidden rounded-control bg-bg">
                    {product.images[shown] ? (
                      <Image src={product.images[shown]} alt={product.title} fill sizes="(min-width: 768px) 420px, 90vw" className="object-contain p-4" />
                    ) : null}
                  </div>
                  {product.images.length > 1 ? (
                    <ul className="mt-3 flex gap-2" aria-label="Photos">
                      {product.images.slice(0, 5).map((src, i) => (
                        <li key={src}>
                          <button
                            type="button"
                            onClick={() => setShown(i)}
                            aria-label={`Photo ${i + 1}`}
                            aria-pressed={i === shown}
                            className={`relative block h-14 w-14 overflow-hidden rounded-control border-2 bg-bg ${i === shown ? "border-brand-500" : "border-border hover:border-ink/30"}`}
                          >
                            <Image src={src} alt="" fill sizes="56px" className="object-contain p-1" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Details */}
                <div className="flex flex-col p-5 sm:p-7">
                  {product.label ? <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600">{product.label}</p> : null}
                  <h2 id={titleId} className="mt-1 pr-10 font-display text-2xl font-extrabold leading-tight tracking-title">{product.title}</h2>

                  <p className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    {product.hasVariants ? <span className="text-sm font-semibold text-muted">From</span> : null}
                    <span className="font-display text-3xl font-extrabold tabular-nums text-brand-500">{formatLkr(product.current)}</span>
                    {product.save > 0 ? (
                      <>
                        <span className="sr-only">Regular price</span>
                        <s className="text-sm text-muted tabular-nums">{formatLkr(product.price)}</s>
                      </>
                    ) : null}
                  </p>
                  {product.save > 0 ? <p className="mt-1 text-sm font-bold text-success">You save {formatLkr(product.save)}</p> : null}

                  <p className={`mt-4 inline-flex items-center gap-2 text-sm font-semibold ${product.available ? "text-success" : "text-danger"}`}>
                    <span aria-hidden className={`h-2 w-2 rounded-full ${product.available ? "bg-success" : "bg-danger"}`} />
                    {!product.available ? "Out of stock" : product.low ? `In stock · only ${product.low} left` : "In stock"}
                  </p>

                  {product.summary ? <p className="mt-4 line-clamp-4 text-[15px] leading-7 text-muted">{product.summary}</p> : null}

                  {product.details.length ? (
                    <ul className="mt-5 grid grid-cols-3 gap-2" aria-label="Key details">
                      {product.details.map((d) => (
                        <li key={d.name} className="rounded-control border border-border p-2.5 text-center">
                          <span className="block truncate text-sm font-bold">{d.value}</span>
                          <span className="block truncate text-[11px] text-muted">{d.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-auto flex items-center gap-2 pt-6">
                    <div className="flex-1">
                      {product.available && !product.hasVariants ? (
                        <AddToCartButton
                          line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: product.current }}
                        />
                      ) : (
                        <Link href={href} className="btn-primary w-full">
                          {product.available ? "Choose options" : "View details"}
                        </Link>
                      )}
                    </div>
                    <WishlistButton className="h-11 w-11 shrink-0" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: product.current }} />
                  </div>
                  <Link href={href} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline">
                    View full details <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
