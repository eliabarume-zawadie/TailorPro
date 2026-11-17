'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Minimal form primitives for Checkpoint B. The full design system (tokens, states, documentation) is Checkpoint C1.

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

export function Button({ variant = 'primary', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'link' }) {
  return <button {...rest} className={`btn btn-${variant}`} />;
}

export function Banner({ kind, children }: { kind: 'error' | 'info' | 'success'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return <p className="spinner" role="status">{label}</p>;
}
