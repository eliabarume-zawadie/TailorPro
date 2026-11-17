'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastApi { show: (message: string) => void }
const ToastContext = createContext<ToastApi | null>(null);
const LIFETIME_MS = 5000;

/**
 * Brief confirmation messages ("Profile saved."). The live region is always in the page, so a screen reader
 * announces the first message too. Errors that need action belong in a Banner, not a toast.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const show = useCallback((text: string) => {
    const id = next.current++;
    setMessages((m) => [...m, { id, text }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setMessages((m) => m.filter((x) => x.id !== id));
    }, LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => { const all = timers.current; return () => { all.forEach(clearTimeout); all.clear(); }; }, []);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {messages.map((m) => <p key={m.id} className="toast">{m.text}</p>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
