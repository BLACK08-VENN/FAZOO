import { FazooMark } from './fazoo-mark';

export function WorkspaceBrand() {
  return (
    <div className="fazoo-sidebar-brand">
      <FazooMark className="size-10" />
      <div>
        <strong>FAZOO</strong>
        <small>Field & service operations</small>
      </div>
    </div>
  );
}
