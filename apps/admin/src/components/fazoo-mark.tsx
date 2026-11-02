import Image from 'next/image';
import { cn } from '@/lib/cn';

export function FazooMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-block size-12 shrink-0', className)}>
      <Image
        src="/brand/fazoo-monogram.webp"
        alt="Fazoo"
        fill
        sizes="48px"
        className="object-contain"
        priority
      />
    </span>
  );
}
