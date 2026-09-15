'use client';

import { Printer } from 'lucide-react';

/** Opens the browser's print dialog, which the user can save as PDF. */
export function PrintButton({ label = 'Download PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
    >
      <Printer size={16} aria-hidden="true" />
      {label}
    </button>
  );
}