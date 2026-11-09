import { OperationsWorkspace } from '@/components/operations/workspace';
import { initialFurnitureOperations } from '@/lib/operations/furniture-preview';

export const metadata = {
  title: 'Furniture Rama operations — Fazoo',
  robots: { index: false, follow: false },
};

export default function FurnitureRamaPage() {
  return <OperationsWorkspace initial={initialFurnitureOperations()} preview furniture />;
}
