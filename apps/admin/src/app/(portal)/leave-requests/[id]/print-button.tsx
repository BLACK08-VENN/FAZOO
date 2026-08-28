'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Printer size={16} aria-hidden="true" />
      Print request
    </button>
  );
}
