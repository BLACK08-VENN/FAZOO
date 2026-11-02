import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'fazoo-table touch-pan-x overflow-x-auto overscroll-x-contain rounded-2xl border bg-white',
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
  return (
    <table className={cn('w-full text-left text-sm', className)} role="table" {...props} />
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-ink/8 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted sm:px-4',
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('border-b border-ink/5 px-3 py-3 align-middle text-ink sm:px-4', className)}
      {...props}
    />
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted" role="cell">
        {children}
      </td>
    </tr>
  );
}
