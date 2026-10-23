import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Class names for the shared buttons. Secondary and outline are the same bordered control. */
export const BUTTON_CLASS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-outline",
  text: "btn-text",
  danger: "btn-danger",
  dark: "btn-dark",
} as const;

export type ButtonVariant = keyof typeof BUTTON_CLASS;

export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return [BUTTON_CLASS[variant], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; children: ReactNode }) {
  return (
    <button
      {...props}
      className={buttonClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}
