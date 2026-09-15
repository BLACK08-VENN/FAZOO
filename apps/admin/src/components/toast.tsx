'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'info';

type ToastMessage = { id: number; tone: ToastTone; text: string };

/**
 * Fire a toast from anywhere: `window.dispatchEvent(new CustomEvent('fazoo:toast', { detail: { text, tone } }))`.
 * Used after in-page mutations (deletes, publishes) where the component that
 * triggered the action stays mounted and a redirect would otherwise wipe the
 * message.
 */
export function fazooToast(text: string, tone: ToastTone = 'success') {
  window.dispatchEvent(new CustomEvent('fazoo:toast', { detail: { text, tone } }));
}

let nextId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<{ text: string; tone?: ToastTone }>).detail;
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, tone: detail.tone ?? 'success', text: detail.text }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
      }, 4000);
    }
    window.addEventListener('fazoo:toast', onToast);
    return () => window.removeEventListener('fazoo:toast', onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-72 flex-col gap-2 sm:bottom-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="fazoo-toast-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border border-ok/25 bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)] dark:border-ok/40 dark:bg-charcoal"
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <p className="flex-1 text-sm text-ink">{toast.text}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            className="-m-1 rounded p-1 text-muted hover:bg-lavender hover:text-ink"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}