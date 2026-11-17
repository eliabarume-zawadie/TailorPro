'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './components';

/**
 * Modal dialog on the native <dialog> element, which traps focus and makes the page behind inert.
 * Escape and the Android back gesture close it, and focus returns to the control that opened it.
 */
export function Dialog({ open, title, closeLabel, onClose, children }: {
  open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const isOpen = d.hasAttribute('open');
    if (open && !isOpen) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      d.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
    } else if (!open && isOpen) {
      if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>{closeLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
