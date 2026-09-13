import 'server-only';
import type { OcrInput, OcrProvider, OcrResult } from './types';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_OPENAI_BYTES = 20 * 1024 * 1024;

function extensionForMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'application/pdf': return 'pdf';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/tiff': return 'tiff';
    case 'image/heic': return 'heic';
    case 'image/jpeg':
    default: return 'jpg';
  }
}

function openAiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  }
  return fallback;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const body = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: unknown;
      content?: Array<{ type?: unknown; text?: unknown }>;
    }>;
  };

  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of body.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function toResult(text: string, model: string): OcrResult {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    provider: 'openai-document-vision',
    model,
    // The Responses API does not expose a calibrated OCR confidence score.
    // Callers intentionally store this provider's confidence as null and mark
    // the generated Word file for human review before printing.
    confidence: 100,
    pageCount: 1,
    blocks: lines.map((line) => ({ kind: 'paragraph' as const, text: line })),
    text: normalized,
  };
}

export function createOpenAiProvider(): OcrProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const model = process.env.OPENAI_DOCUMENT_MODEL?.trim() || DEFAULT_MODEL;

  return {
    name: `OpenAI ${model}`,
    configured: Boolean(apiKey),

    async analyze(input: OcrInput): Promise<OcrResult> {
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured on the FAZOO server.');
      }
      if (input.bytes.byteLength === 0) {
        throw new Error('The uploaded document is empty.');
      }
      if (input.bytes.byteLength > MAX_OPENAI_BYTES) {
        throw new Error('This document is larger than the 20 MB FAZOO AI conversion limit.');
      }

      const filename = `fazoo-booklist.${extensionForMime(input.mimeType)}`;
      let fileId: string | null = null;

      try {
        const form = new FormData();
        form.append('purpose', 'user_data');
        form.append(
          'file',
          new Blob([Buffer.from(input.bytes)], { type: input.mimeType }),
          filename,
        );

        const uploadResponse = await fetch(`${OPENAI_API_BASE}/files`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          cache: 'no-store',
        });
        const uploadPayload = (await uploadResponse.json().catch(() => null)) as
          | { id?: string; error?: { message?: string } }
          | null;
        if (!uploadResponse.ok || !uploadPayload?.id) {
          throw new Error(
            `OpenAI file upload failed: ${openAiError(uploadPayload, `HTTP ${uploadResponse.status}`)}`,
          );
        }
        fileId = uploadPayload.id;

        const response = await fetch(`${OPENAI_API_BASE}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            store: false,
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_file',
                    file_id: fileId,
                  },
                  {
                    type: 'input_text',
                    text: [
                      'Convert this school booklist into a faithful editable text draft for a Word document.',
                      'Transcribe every readable heading, class/grade, item, book title, publisher/brand, quantity, size, and note in the same logical order as the source.',
                      'Do not summarize, omit, combine, correct, or invent items.',
                      'If text is genuinely unreadable, write [unclear] instead of guessing.',
                      'Return plain text only. Put headings on their own lines and keep each booklist item on its own line.',
                    ].join(' '),
                  },
                ],
              },
            ],
          }),
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            `OpenAI document conversion failed: ${openAiError(payload, `HTTP ${response.status}`)}`,
          );
        }

        const text = extractResponseText(payload);
        if (!text) {
          throw new Error('OpenAI returned no readable text for this document.');
        }
        if (text.length > 500_000) {
          throw new Error('The extracted document text is too large to convert safely.');
        }

        return toResult(text, model);
      } finally {
        if (fileId) {
          await fetch(`${OPENAI_API_BASE}/files/${encodeURIComponent(fileId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store',
          }).catch(() => undefined);
        }
      }
    },
  };
}
