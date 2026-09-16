import Image from 'next/image';
import { cn } from '@/lib/cn';

export function FazooMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#b967ed] via-primary to-deep p-[1.5px] shadow-[0_6px_18px_rgba(123,47,190,0.28)] ring-1 ring-white/10',
        className,
      )}
    >
      <span className="relative block h-full w-full overflow-hidden rounded-[0.656rem]">
        <Image src="/icon.png" alt="Fazoo" fill sizes="40px" className="object-cover" priority />
      </span>
    </span>
  );
}