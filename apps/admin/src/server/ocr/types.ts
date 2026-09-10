/**
 * Normalized shapes shared by every OCR provider.
 *
 * A provider turns a raw booklist artefact (phone photo, scan, PDF or a photo
 * of a handwritten list) into blocks we can lay out in a Word document. The
 * draft is deliberately layout-preserving rather than clever: reformatting into
 * the house booklist template is the admin's job, and a faithful editable draft
 * is far more useful to them than a confident-looking wrong guess.
 */

export type OcrBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; rows: string[][] };

export interface OcrResult {
  /** Provider identifier recorded on the document row, e.g. `azure-document-intelligence`. */
  provider: string;
  /** Model actually used, e.g. `prebuilt-document`. */
  model: string;
  /** Mean line confidence across all pages, 0–100. */
  confidence: number;
  pageCount: number;
  blocks: OcrBlock[];
  /** Flattened plain text, used for the low-confidence preview. */
  text: string;
}

export interface OcrInput {
  bytes: Uint8Array;
  mimeType: string;
}

export interface OcrProvider {
  readonly name: string;
  /** False when the provider's credentials are absent — callers fall back to manual. */
  readonly configured: boolean;
  analyze(input: OcrInput): Promise<OcrResult>;
}

/** Below this mean confidence the job is flagged for manual conversion. */
export const OCR_MIN_CONFIDENCE = Number(process.env.OCR_MIN_CONFIDENCE ?? 60);

/**
 * Reasons a conversion did not produce a usable draft. Surfaced verbatim on the
 * admin queue so the operator knows whether to retry or convert by hand.
 */
export type OcrFailure =
  | { kind: 'not_configured'; message: string }
  | { kind: 'low_confidence'; message: string; confidence: number; result: OcrResult }
  | { kind: 'provider_error'; message: string }
  | { kind: 'unsupported_media'; message: string };

export type OcrOutcome =
  | { ok: true; result: OcrResult; docx: Uint8Array }
  | { ok: false; failure: OcrFailure };

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff']);

export function isSupportedForOcr(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return IMAGE_TYPES.has(mimeType.toLowerCase()) || mimeType.toLowerCase() === 'application/pdf';
}
