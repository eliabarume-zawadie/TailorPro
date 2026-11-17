'use client';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

// TailorPro design system, building blocks. Tokens live in app/globals.css (colour, type, space, focus).
// Principles: 48 px touch targets, status in words (never colour alone), plain verbs, one control radius.

interface FieldBase { id: string; label: string; error?: string; hint?: string }

function describedBy(id: string, error?: string, hint?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}

function FieldShell({ id, label, error, hint, children }: FieldBase & { children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="error" role="alert">{error}</p> : null}
    </div>
  );
}

export function TextField(props: FieldBase & {
  value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  readOnly?: boolean; maxLength?: number;
}) {
  const { id, label, error, hint, value, onChange, type = 'text', autoComplete, inputMode, readOnly, maxLength } = props;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input id={id} name={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        inputMode={inputMode} readOnly={readOnly} maxLength={maxLength} aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)} />
    </FieldShell>
  );
}

export function SelectField(props: FieldBase & { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const { id, label, error, hint, value, onChange, options } = props;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

/** `busy` disables the button and announces it, so a double tap cannot submit twice. */
export function Button({ variant = 'primary', busy, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'link'; busy?: boolean }) {
  return <button {...rest} disabled={disabled || busy} aria-busy={busy ? true : undefined} className={`btn btn-${variant}`} />;
}

export function Banner({ kind, children }: { kind: 'error' | 'info' | 'success'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/** Status shown as a word plus a dot. The word carries the meaning; colour only reinforces it. */
export function Badge({ tone, children }: { tone: 'online' | 'offline' | 'neutral'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" aria-hidden="true" />{children}</span>;
}

/** An empty screen is an invitation to act: say what belongs here and offer the next step when there is one. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const id = useId();
  return (
    <section className="empty" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

/** A seam: the stitched line that divides sections. */
export function Stitch() {
  return <hr className="stitch" aria-hidden="true" />;
}

/** The measuring tape under the top of every page. Decorative; it unrolls once on load. */
export function TapeRule() {
  return <div className="tape" aria-hidden="true" />;
}

export function Spinner({ label }: { label: string }) {
  return <p className="spinner" role="status">{label}</p>;
}
