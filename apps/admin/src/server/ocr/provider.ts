import 'server-only';
import { createAzureProvider } from './azure';
import type { OcrProvider } from './types';

/**
 * Provider registry.
 *
 * `DOCUMENT_AI_PROVIDER` selects the implementation; when it is unset we use
 * Azure if its credentials are present. With no usable provider the pipeline
 * still runs — jobs simply stay in the manual conversion queue, which is the
 * designed fallback rather than an error state.
 *
 * Adding another vendor means one new file exporting an `OcrProvider` plus a
 * case below; nothing else in the pipeline changes.
 */
export function resolveOcrProvider(): OcrProvider | null {
  const requested = (process.env.DOCUMENT_AI_PROVIDER ?? '').trim().toLowerCase();

  if (requested === 'none' || requested === 'manual') return null;

  const azure = createAzureProvider();

  if (requested === 'azure' || requested === '') {
    return azure.configured ? azure : null;
  }

  throw new Error(
    `Unknown DOCUMENT_AI_PROVIDER "${requested}". Supported: azure, none.`,
  );
}

export function describeOcrReadiness(): {
  provider: string;
  automated: boolean;
  detail: string;
} {
  const provider = resolveOcrProvider();
  if (!provider) {
    return {
      provider: 'manual',
      automated: false,
      detail:
        'No OCR provider is configured. Uploaded booklists wait in the conversion queue for an admin to convert and format them by hand.',
    };
  }
  return {
    provider: provider.name,
    automated: true,
    detail: `Editable drafts are generated automatically by ${provider.name}; an admin still reviews and formats each one before publishing.`,
  };
}
