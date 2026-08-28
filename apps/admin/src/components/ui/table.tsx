import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-white/80 bg-white/72 shadow-[0_14px_40px_rgba(45,20,58,0.06)] backdrop-blur-xl supports-[not_(backdrop-filter:blur(1px))]:bg-white',
        className,
      )}
      role="region"
      aria-label="Data table"
      tabIndex={0}
      {...props}
    />
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-left text-sm', className)} role="table" {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-ink/8 bg-charcoal px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/90',
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-ink/5 px-4 py-2.5 align-middle text-ink', className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted" role="cell">
        {children}
      </td>
    </tr>
  );
}
