'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

/** Transient success banner shown after a log deletion redirect lands. */
export function DeletedLogBanner({ visible }: { visible: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (!visible) return;
    setShow(true);
    const timer = window.setTimeout(() => {
      setShow(false);
      router.replace(pathname);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [visible, pathname, router]);

  if (!show) return null;

  return (
    <div
      role="status"
      className="fazoo-banner-exit mb-4 flex items-center gap-2 rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm font-medium text-ink"
    >
      <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden="true" />
      Daily log deleted. The action remains visible in Audit Logs.
    </div>
  );
}