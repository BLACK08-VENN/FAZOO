'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const OCR_ASSET_BASE = '/api/ocr/assets';
const TESSERACT_SCRIPT = `${OCR_ASSET_BASE}/tesseract.min.js`;
const TESSERACT_WORKER = `${OCR_ASSET_BASE}/worker.min.js`;
const TESSERACT_CORE = `${OCR_ASSET_BASE}/core`;
const TESSERACT_LANG = `${OCR_ASSET_BASE}/lang`;
const PDFJS_SCRIPT = `${OCR_ASSET_BASE}/pdf.min.js`;
const PDFJS_WORKER = `${OCR_ASSET_BASE}/pdf.worker.min.js`;

const TESSERACT_VERSION = '5.1.1';
const PDFJS_VERSION = '3.11.174';
const DIRECT_TESSERACT_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/${TESSERACT_VERSION}/tesseract.min.js`;
const DIRECT_TESSERACT_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/${TESSERACT_VERSION}/worker.min.js`;
const DIRECT_TESSERACT_CORE = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`;
const DIRECT_TESSERACT_LANG = 'https://tessdata.projectnaptha.com/4.0.0';
const DIRECT_PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const DIRECT_PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const MAX_PDF_PAGES = 20;
const NETWORK_ATTEMPTS = 3;

type TesseractApi = {
  recognize: (
    image: string | HTMLCanvasElement,
    language: string,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void;
      workerPath?: string;
      corePath?: string;
      langPath?: string;
    },
  ) => Promise<{ data: { text: string; confidence: number } }>;
};

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};
type PdfJsApi = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
type BrowserLibraries = Window & {
  Tesseract?: TesseractApi;
  pdfjsLib?: PdfJsApi;
};

type ConvertResponse = {
  error?: string;
  message?: string;
  outcome?: 'draft_created' | 'manual_required' | 'failed';
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = NETWORK_ATTEMPTS,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }

    await sleep(attempt * 500);
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed.');
}

function loadExternalScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${id}.`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error(`Could not load ${id}.`)), { once: true });
    document.head.appendChild(script);
  });
}

async function loadScriptWithFallback(
  primary: string,
  fallback: string,
  id: string,
  fallbackId: string,
): Promise<void> {
  try {
    await loadExternalScript(primary, id);
  } catch {
    await loadExternalScript(fallback, fallbackId);
  }
}

function extensionFromResponse(response: Response): string {
  try {
    const pathname = new URL(response.url).pathname;
    const file = pathname.split('/').pop() ?? '';
    return file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
  } catch {
    return '';
  }
}

function isNetworkLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|network|fetch|load|worker|core|traineddata/i.test(message);
}

export function GradeOrderActions({
  gradeRequestId,
  conversionStatus,
  hasWord,
  conversionError,
  canAct,
}: {
  gradeRequestId: string;
  conversionStatus: string;
  hasWord: boolean;
  conversionError: string | null;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function recognizeWithTesseract(
    api: TesseractApi,
    image: string | HTMLCanvasElement,
    label: string,
  ): Promise<{ text: string; confidence: number }> {
    const logger = (message: { status?: string; progress?: number }) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        setFeedback(`${label}: reading text ${Math.round(message.progress * 100)}%`);
      }
    };

    try {
      const { data } = await api.recognize(image, 'eng', {
        workerPath: TESSERACT_WORKER,
        corePath: TESSERACT_CORE,
        langPath: TESSERACT_LANG,
        logger,
      });
      return { text: data.text ?? '', confidence: Number(data.confidence ?? 0) };
    } catch (error) {
      if (!isNetworkLikeError(error)) throw error;

      setFeedback(`${label}: connection interrupted, retrying OCR…`);
      await sleep(600);
      const { data } = await api.recognize(image, 'eng', {
        workerPath: DIRECT_TESSERACT_WORKER,
        corePath: DIRECT_TESSERACT_CORE,
        langPath: DIRECT_TESSERACT_LANG,
        logger,
      });
      return { text: data.text ?? '', confidence: Number(data.confidence ?? 0) };
    }
  }

  async function runBrowserOcr(
    blob: Blob,
    extension: string,
  ): Promise<{ text: string; confidence: number; pageCount: number }> {
    const libraries = window as BrowserLibraries;
    if (!libraries.Tesseract) {
      setFeedback('Loading the free Tesseract OCR engine…');
      await loadScriptWithFallback(
        TESSERACT_SCRIPT,
        DIRECT_TESSERACT_SCRIPT,
        'fazoo-tesseract',
        'fazoo-tesseract-direct',
      );
    }
    const tesseract = (window as BrowserLibraries).Tesseract;
    if (!tesseract) throw new Error('Tesseract did not load correctly.');

    const mime = blob.type.toLowerCase();
    const isPdf = mime === 'application/pdf' || extension === 'pdf';
    if (!isPdf) {
      const objectUrl = URL.createObjectURL(blob);
      try {
        const result = await recognizeWithTesseract(tesseract, objectUrl, 'Reading image');
        if (!result.text.trim()) throw new Error('Tesseract could not find readable text in this image.');
        return { ...result, pageCount: 1 };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (!libraries.pdfjsLib) {
      setFeedback('Loading the free PDF reader…');
      await loadScriptWithFallback(
        PDFJS_SCRIPT,
        DIRECT_PDFJS_SCRIPT,
        'fazoo-pdfjs',
        'fazoo-pdfjs-direct',
      );
    }
    const pdfjs = (window as BrowserLibraries).pdfjsLib;
    if (!pdfjs) throw new Error('The PDF reader did not load correctly.');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    setFeedback('Opening PDF for free OCR…');
    let pdf: PdfDocument;
    try {
      pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    } catch (error) {
      if (!isNetworkLikeError(error)) throw error;
      pdfjs.GlobalWorkerOptions.workerSrc = DIRECT_PDFJS_WORKER;
      pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    }

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`This free browser converter currently supports PDFs up to ${MAX_PDF_PAGES} pages.`);
    }

    const pageTexts: string[] = [];
    let confidenceTotal = 0;
    let pagesWithText = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setFeedback(`Preparing PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(0.9, Math.min(1.8, 2200 / base.width, 3000 / base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error(`Could not prepare PDF page ${pageNumber}.`);
      await page.render({ canvasContext: context, viewport }).promise;

      const result = await recognizeWithTesseract(
        tesseract,
        canvas,
        `PDF page ${pageNumber} of ${pdf.numPages}`,
      );
      if (result.text.trim()) {
        pageTexts.push(result.text.trim());
        confidenceTotal += result.confidence;
        pagesWithText += 1;
      }
      canvas.width = 1;
      canvas.height = 1;
    }

    const text = pageTexts.join('\n\n');
    if (!text) throw new Error('Tesseract could not find readable text in this PDF.');
    return {
      text,
      confidence: pagesWithText > 0 ? confidenceTotal / pagesWithText : 0,
      pageCount: pdf.numPages,
    };
  }

  async function submitBrowserOcr(payload: {
    text: string;
    confidence: number;
    pageCount: number;
  }): Promise<ConvertResponse> {
    setFeedback('Creating the editable Word document…');
    const response = await fetchWithRetry(`/api/booklists/grades/${gradeRequestId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientOcr: payload }),
    });
    const body = (await response.json()) as ConvertResponse;
    if (!response.ok) throw new Error(body.error ?? body.message ?? 'Conversion failed.');
    return body;
  }

  async function serverConvert(): Promise<ConvertResponse> {
    const response = await fetchWithRetry(`/api/booklists/grades/${gradeRequestId}/convert`, {
      method: 'POST',
    });
    const body = (await response.json()) as ConvertResponse;
    if (!response.ok) throw new Error(body.error ?? body.message ?? 'Conversion failed.');
    return body;
  }

  async function convert() {
    setBusy(true);
    setFeedback(null);
    setFailed(false);
    try {
      setFeedback('Checking the original document…');
      const rawResponse = await fetchWithRetry(
        `/api/booklists/grades/${gradeRequestId}/download?kind=raw`,
        { cache: 'no-store' },
      );
      if (!rawResponse.ok) {
        throw new Error('Could not read the original uploaded document.');
      }

      const blob = await rawResponse.blob();
      const extension = extensionFromResponse(rawResponse);
      const mime = blob.type.toLowerCase();
      const browserOcrCandidate =
        mime === 'application/pdf' ||
        mime.startsWith('image/') ||
        ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension);

      const body = browserOcrCandidate
        ? await submitBrowserOcr(await runBrowserOcr(blob, extension))
        : await serverConvert();

      if (body.outcome === 'manual_required') {
        setFailed(true);
        setFeedback(body.message ?? 'This file needs manual conversion.');
      } else {
        setFeedback(body.message ?? 'Word document created.');
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      const message = error instanceof Error ? error.message : 'Conversion failed.';
      setFeedback(
        isNetworkLikeError(error)
          ? 'OCR connection was interrupted after retries. Please tap Retry conversion once more.'
          : `Free Tesseract conversion failed: ${message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/booklists/grades/${gradeRequestId}/download?kind=raw`}
          className="inline-flex h-8 items-center rounded-lg border border-ink/15 bg-white px-2.5 text-xs font-medium text-ink hover:bg-lavender"
        >
          Original
        </a>
        {hasWord ? (
          <a
            href={`/api/booklists/grades/${gradeRequestId}/download?kind=word`}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-white hover:bg-deep"
          >
            Word document
          </a>
        ) : canAct ? (
          <Button type="button" size="sm" onClick={() => void convert()} disabled={busy}>
            {busy ? 'Converting…' : conversionStatus === 'failed' ? 'Retry conversion' : 'Convert to Word'}
          </Button>
        ) : null}
      </div>
      <p className={`text-[11px] ${conversionStatus === 'succeeded' ? 'text-ok' : conversionStatus === 'failed' || conversionStatus === 'manual_required' ? 'text-bad' : 'text-muted'}`}>
        {hasWord
          ? 'Word ready'
          : conversionStatus === 'processing'
            ? 'Conversion in progress'
            : conversionStatus === 'failed'
              ? 'Conversion failed'
              : conversionStatus === 'manual_required'
                ? 'Free OCR available — retry conversion'
                : 'Waiting for conversion'}
      </p>
      {conversionError && !feedback ? <p className="max-w-72 text-[11px] text-bad">{conversionError}</p> : null}
      {feedback ? <p className={`max-w-72 text-[11px] ${failed ? 'text-bad' : 'text-ok'}`}>{feedback}</p> : null}
    </div>
  );
}
