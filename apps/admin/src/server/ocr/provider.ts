import 'server-only';
import { createAzureProvider } from './azure';
import { createOpenAiProvider } from './openai';
import type { OcrProvider } from './types';

/**
 * Provider registry.
 *
 * `DOCUMENT_AI_PROVIDER` selects the implementation. OpenAI is only used when
 * explicitly requested via `DOCUMENT_AI_PROVIDER=openai` — an `OPENAI_API_KEY`
 * alone no longer opts into it, so a billing breakage cannot knock every
 * booklist into a failed state. Azure is auto-selected when its credentials are
 * configured. With no usable provider the pipeline stays in the manual
 * conversion state instead of failing unexpectedly.
 *
 * Provider credentials are intentionally read from the server environment and
 * are never exposed to the browser bundle.
 */
export function resolveOcrProvider(): OcrProvider | null {
  const requested = (process.env.DOCUMENT_AI_PROVIDER ?? '').trim().toLowerCase();

  if (requested === 'none' || requested === 'manual') return null;

  const openai = createOpenAiProvider();
  const azure = createAzureProvider();

  if (requested === 'openai') return openai.configured ? openai : null;
  if (requested === 'azure') return azure.configured ? azure : null;

  if (requested === '') {
    if (azure.configured) return azure;
    return null;
  }

  throw new Error(
    `Unknown DOCUMENT_AI_PROVIDER "${requested}". Supported: openai, azure, none.`,
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
        'No server-side document AI provider is configured. Set DOCUMENT_AI_PROVIDER to "openai" or "azure" and provide the corresponding credentials to enable automated conversion.',
    };
  }
  return {
    provider: provider.name,
    automated: true,
    detail: `Editable drafts are generated automatically by ${provider.name}; an admin still reviews each one before printing.`,
  };
}
