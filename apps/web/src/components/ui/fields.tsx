import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function FieldFrame({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hintId ? <p id={hintId} className="type-caption mt-1.5">{hint}</p> : null}
      {errorId ? <p id={errorId} className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({ id, label, hint, error, className = "", ...props }: { id: string; label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input id={id} className={`input ${className}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
    </FieldFrame>
  );
}

export function TextArea({ id, label, hint, error, className = "", ...props }: { id: string; label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <textarea id={id} className={`textarea ${className}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
    </FieldFrame>
  );
}

export function SelectField({ id, label, hint, error, children, className = "", ...props }: { id: string; label: string; hint?: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <select id={id} className={`select ${className}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props}>
        {children}
      </select>
    </FieldFrame>
  );
}

export function CheckboxField({ id, label, error, ...props }: { id: string; label: string; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id">) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2 text-sm text-ink">
        <input id={id} type="checkbox" className="check mt-0.5" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />
        <span>{label}</span>
      </label>
      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
