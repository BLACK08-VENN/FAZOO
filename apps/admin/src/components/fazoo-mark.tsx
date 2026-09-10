import Image from 'next/image';
import { cn } from '@/lib/cn';

export function FazooMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative block size-10 shrink-0 overflow-hidden rounded-xl', className)}>
      <Image src="/icon.png" alt="Fazoo" fill sizes="40px" className="object-cover" priority />
    </span>
  );
}
