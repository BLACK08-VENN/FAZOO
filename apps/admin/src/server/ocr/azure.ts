import 'server-only';
import type { OcrBlock, OcrInput, OcrProvider, OcrResult } from './types';

/**
 * Azure AI Document Intelligence provider.
 *
 * Uses the `prebuilt-document` model, which is the only generally-available
 * Azure model that reads freeform handwriting — the common case here, since a
 * principal hands the BA a hand-written list far more often than a printed one.
 *
 * The API is asynchronous: POST returns 202 with an `operation-location` header
 * that we poll until the analysis settles.
 */

interface AzureLine {
  content?: string;
  confidence?: number;
}

interface AzureCell {
  rowIndex?: number;
  columnIndex?: number;
  content?: string;
}

interface AzureTable {
  rowCount?: number;
  columnCount?: number;
  cells?: AzureCell[];
}

interface AzureParagraph {
  content?: string;
  role?: string;
}

interface AzurePage {
  pageNumber?: number;
  lines?: AzureLine[];
  paragraphs?: AzureParagraph[];
  tables?: AzureTable[];
}

interface AnalyzeResponse {
  status?: string;
  error?: { code?: string; message?: string };
  analyzeResult?: {
    modelId?: string;
    pages?: AzurePage[];
  };
}

const API_VERSION = process.env.AZURE_DOCUMENT_AI_API_VERSION ?? '2024-11-30';
const RESOURCE_PATH = process.env.AZURE_DOCUMENT_AI_RESOURCE_PATH ?? 'documentintelligence';
const MODEL = process.env.AZURE_DOCUMENT_AI_MODEL ?? 'prebuilt-document';
const REQUEST_TIMEOUT_MS = Number(process.env.AZURE_DOCUMENT_AI_TIMEOUT_MS ?? 60_000);
const POLL_INTERVAL_MS = 1_500;
const POLL_BUDGET_MS = 180_000;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** A short ALL-CAPS line is almost always a subject or section heading. */
function isHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 70) return false;
  if (/[a-z]/.test(trimmed)) return false;
  return /[A-Z]/.test(trimmed);
}

function meanConfidence(pages: AzurePage[]): number {
  let sum = 0;
  let count = 0;
  for (const page of pages) {
    for (const line of page.lines ?? []) {
      if (typeof line.confidence === 'number') {
        sum += line.confidence;
        count += 1;
      }
    }
  }
  if (count === 0) return 0;
  return Math.round(((sum / count) * 100 + Number.EPSILON) * 100) / 100;
}

/**
 * Azure reports tables as a flat cell list keyed by row/column index. Rebuild
 * the grid so the Word draft keeps the school's own column structure.
 */
function tableToRows(table: AzureTable): string[][] {
  const rowCount = table.rowCount ?? 0;
  const columnCount = table.columnCount ?? 0;
  if (rowCount === 0 || columnCount === 0) return [];

  const grid: string[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => ''),
  );
  for (const cell of table.cells ?? []) {
    const r = cell.rowIndex ?? -1;
    const c = cell.columnIndex ?? -1;
    if (r >= 0 && r < rowCount && c >= 0 && c < columnCount) {
      const row = grid[r];
      if (row) row[c] = (cell.content ?? '').trim();
    }
  }
  return grid.filter((row) => row.some((cell) => cell.length > 0));
}

function pagesToBlocks(pages: AzurePage[]): OcrBlock[] {
  const blocks: OcrBlock[] = [];

  for (const page of pages) {
    const paragraphs = page.paragraphs ?? [];

    if (paragraphs.length > 0) {
      for (const paragraph of paragraphs) {
        const text = (paragraph.content ?? '').trim();
        if (!text) continue;
        blocks.push({
          kind: paragraph.role === 'title' || isHeading(text) ? 'heading' : 'paragraph',
          text,
        });
      }
    } else {
      // No paragraph structure (common with handwriting): keep one editable line
      // per detected line so the admin can rearrange without retyping.
      for (const line of page.lines ?? []) {
        const text = (line.content ?? '').trim();
        if (!text) continue;
        blocks.push({ kind: isHeading(text) ? 'heading' : 'paragraph', text });
      }
    }

    for (const table of page.tables ?? []) {
      const rows = tableToRows(table);
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
    }
  }

  return blocks;
}

async function requestJson(url: string, init: RequestInit, apiKey: string): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
}

export function createAzureProvider(): OcrProvider {
  const endpoint = process.env.AZURE_DOCUMENT_AI_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_AI_KEY;
  const configured = Boolean(endpoint && apiKey);

  return {
    name: 'azure-document-intelligence',
    configured,

    async analyze(input: OcrInput): Promise<OcrResult> {
      if (!endpoint || !apiKey) {
        throw new Error('Azure Document Intelligence is not configured');
      }

      const base = `${stripTrailingSlash(endpoint)}/${RESOURCE_PATH}/documentModels/${MODEL}:analyze`;
      const started = await requestJson(
        `${base}?api-version=${API_VERSION}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: Buffer.from(input.bytes),
        },
        apiKey,
      );

      if (!started.ok) {
        const body = await started.text().catch(() => '');
        throw new Error(
          `Azure analyze request failed (${started.status}): ${body.slice(0, 300) || started.statusText}`,
        );
      }

      const operationLocation = started.headers.get('operation-location');
      if (!operationLocation) {
        throw new Error('Azure did not return an operation-location header');
      }

      const deadline = Date.now() + POLL_BUDGET_MS;
      let final: AnalyzeResponse | null = null;

      while (Date.now() < deadline) {
        const poll = await requestJson(operationLocation, { method: 'GET' }, apiKey);
        if (!poll.ok) {
          const body = await poll.text().catch(() => '');
          throw new Error(`Azure polling failed (${poll.status}): ${body.slice(0, 300)}`);
        }

        const payload = (await poll.json()) as AnalyzeResponse;
        if (payload.status === 'succeeded') {
          final = payload;
          break;
        }
        if (payload.status === 'failed') {
          throw new Error(
            `Azure analysis failed: ${payload.error?.message ?? payload.error?.code ?? 'unknown error'}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!final?.analyzeResult) {
        throw new Error('Azure analysis timed out before completing');
      }

      const pages = final.analyzeResult.pages ?? [];
      const blocks = pagesToBlocks(pages);

      return {
        provider: 'azure-document-intelligence',
        model: final.analyzeResult.modelId ?? MODEL,
        confidence: meanConfidence(pages),
        pageCount: pages.length,
        blocks,
        text: blocks
          .flatMap((block) =>
            block.kind === 'table' ? block.rows.map((row) => row.join('\t')) : [block.text],
          )
          .join('\n'),
      };
    },
  };
}
