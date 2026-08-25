export type ErrorDisposition = 'retry' | 'terminal' | 'auth';

const TERMINAL_PATTERNS = [
  /not available/i,
  /not found/i,
  /already/i,
  /locked/i,
  /must be/i,
  /cannot/i,
  /outside/i,
  /geofence/i,
  /no active assignment/i,
  /weekly off/i,
];

export function classifySyncError(error: unknown): ErrorDisposition {
  const candidate = error as { message?: string; status?: number } | null;
  const message = candidate?.message ?? String(error);
  if (
    candidate?.status === 401 ||
    candidate?.status === 403 ||
    /jwt|session|auth/i.test(message)
  ) {
    return 'auth';
  }
  return TERMINAL_PATTERNS.some((pattern) => pattern.test(message)) ? 'terminal' : 'retry';
}
