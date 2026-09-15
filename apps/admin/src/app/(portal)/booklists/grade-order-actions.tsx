'use client';

import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fazooToast } from '@/components/toast';

const OCR_ASSET_BASE = '/api/ocr/assets';
const TESSERACT_SCRIPT = `${OCR_ASSET_BASE}/tesseract.min.js`;
const TESSERACT_WORKER = `${OCR_ASSET_BASE}/worker.min.js`;
const TESSERACT_CORE = `${OCR_ASSET_BASE}/core`;
const TESSERACT_LANG = `${OCR_ASSET_BASE}/lang`;
const PDFJS_SCRIPT = `${OCR_ASSET_BASE}/pdf.min.js`;
const PDFJS_WORKER = `${OCR_ASSET_BASE}/pdf.worker.min.js`;
const MAX_PDF_PAGES = 20;
const NETWORK_ATTEMPTS = 3;
const OCR_LIBRARY_WAIT_ATTEMPTS = 300; // Allow up to 60s on slow or cold connections.

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

async function waitForLibrary<T>(read: () => T | undefined, label: string): Promise<T> {
  for (let attempt = 0; attempt < OCR_LIBRARY_WAIT_ATTEMPTS; attempt += 1) {
    const library = read();
    if (library) return library;
    await sleep(200);
  }
  throw new Error(`${label} did not finish loading after 60 seconds.`);
}

function extensionFromResponse(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1].replace(/"/g, '')) : '';
  if (filename.includes('.')) return filename.split('.').pop()!.toLowerCase();

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
  return /failed to fetch|network|fetch|load|worker|core|traineddata|connection|timeout/i.test(message);
}

export function GradeOrderActions({
  gradeRequestId,
  conversionStatus,
  conversionProvider,
  hasWord,
  canAct,
}: {
  gradeRequestId: string;
  conversionStatus: string;
  conversionProvider: string | null;
  hasWord: boolean;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const wordInputRef = useRef<HTMLInputElement>(null);

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

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const { data } = await api.recognize(image, 'eng', {
          workerPath: TESSERACT_WORKER,
          corePath: TESSERACT_CORE,
          langPath: TESSERACT_LANG,
          logger,
        });
        return { text: data.text ?? '', confidence: Number(data.confidence ?? 0) };
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          setFeedback(`${label}: retrying the free OCR engine…`);
          await sleep(800);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Free OCR failed.');
  }

  async function runBrowserOcr(
    blob: Blob,
    extension: string,
  ): Promise<{ text: string; confidence: number; pageCount: number }> {
    setFeedback('Starting the free OCR engine…');
    const tesseract = await waitForLibrary(
      () => (window as BrowserLibraries).Tesseract,
      'The free OCR engine',
    );

    const mime = blob.type.toLowerCase();
    const isPdf = mime === 'application/pdf' || extension === 'pdf';
    if (!isPdf) {
      const objectUrl = URL.createObjectURL(blob);
      try {
        const result = await recognizeWithTesseract(tesseract, objectUrl, 'Reading image');
        if (!result.text.trim()) throw new Error('No readable text was found in this image.');
        return { ...result, pageCount: 1 };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    setFeedback('Opening PDF with the free reader…');
    const pdfjs = await waitForLibrary(
      () => (window as BrowserLibraries).pdfjsLib,
      'The PDF reader',
    );
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`Free conversion currently supports PDFs up to ${MAX_PDF_PAGES} pages.`);
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
    if (!text) throw new Error('No readable text was found in this PDF.');

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
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as ConvertResponse;
    if (!response.ok) throw new Error(body.error ?? body.message ?? 'Word creation failed.');
    return body;
  }

  async function serverConvert(): Promise<ConvertResponse> {
    const response = await fetchWithRetry(`/api/booklists/grades/${gradeRequestId}/convert`, {
      method: 'POST',
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as ConvertResponse;
    if (!response.ok) throw new Error(body.error ?? body.message ?? 'Conversion failed.');
    return body;
  }

  async function convert() {
    setBusy(true);
    setFeedback('Checking the original document…');
    setFailed(false);

    try {
      const rawResponse = await fetchWithRetry(
        `/api/booklists/grades/${gradeRequestId}/download?kind=raw`,
        { cache: 'no-store' },
      );
      if (!rawResponse.ok) throw new Error('Could not read the original uploaded document.');

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

      if (body.outcome === 'manual_required' || body.outcome === 'failed') {
        setFailed(true);
        setFeedback(body.message ?? 'Free conversion could not complete this file.');
        return;
      }

      setFeedback(body.message ?? 'Word document created with free OCR.');
      router.refresh();
    } catch (error) {
      setFailed(true);
      const message = error instanceof Error ? error.message : 'Conversion failed.';
      setFeedback(
        isNetworkLikeError(error)
          ? `The OCR engine could not finish loading: ${message} Check your connection, refresh the page, and retry conversion.`
          : `Free conversion failed: ${message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishWord() {
    if (!wordFile) return;
    setBusy(true);
    setFailed(false);
    setFeedback('Uploading the manually prepared Word document…');
    try {
      const form = new FormData();
      form.set('file', wordFile);
      form.set('client_request_id', crypto.randomUUID());
      const response = await fetch(`/api/booklists/grades/${gradeRequestId}/word`, {
        method: 'POST', body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not publish the Word document.');
      setFeedback('Corrected Word document attached. It is ready to share with the school for approval.');
      fazooToast('Corrected Word document attached successfully.');
      setWordFile(null);
      if (wordInputRef.current) wordInputRef.current.value = '';
      router.refresh();
    } catch (error) {
      setFailed(true);
      setFeedback(error instanceof Error ? error.message : 'Could not publish the Word document.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script src={TESSERACT_SCRIPT} strategy="afterInteractive" />
      <Script src={PDFJS_SCRIPT} strategy="afterInteractive" />
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
              {conversionProvider === 'manual' ? 'Final Word document' : 'Download OCR draft'}
            </a>
          ) : canAct ? (
            <Button type="button" size="sm" onClick={() => void convert()} disabled={busy}>
              {busy ? 'Converting image…' : 'Convert image to Word'}
            </Button>
          ) : null}
        </div>
        {canAct ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Manually prepared Word document"
              ref={wordInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => {
                setWordFile(event.target.files?.[0] ?? null);
                setFeedback(null);
                setFailed(false);
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (wordFile) {
                  void publishWord();
                  return;
                }
                wordInputRef.current?.click();
              }}
            >
              {busy
                ? 'Uploading Word…'
                : wordFile
                  ? 'Upload corrected Word'
                  : 'Attach corrected Word'}
            </Button>
            {wordFile ? (
              <span className="max-w-48 truncate text-xs text-muted" title={wordFile.name}>
                {wordFile.name}
              </span>
            ) : null}
          </div>
        ) : null}
        {hasWord ? (
          <p className="text-[11px] text-muted">
            {conversionProvider === 'manual'
              ? 'The corrected Word document is ready to share with the school for approval.'
              : 'Download the OCR draft, correct it in Word, then attach the corrected document below.'}
          </p>
        ) : (
          <p className="text-[11px] text-muted">Convert a clear image or scanned PDF into an editable Word draft, then review and correct it.</p>
        )}
        <p className={`text-[11px] ${conversionStatus === 'succeeded' ? 'text-ok' : conversionStatus === 'failed' || conversionStatus === 'manual_required' ? 'text-warn' : 'text-muted'}`}>
          {hasWord
            ? conversionProvider === 'manual' ? 'Corrected Word ready for approval' : 'OCR draft awaiting admin corrections'
            : conversionStatus === 'processing'
              ? 'Free conversion in progress'
              : conversionStatus === 'failed' || conversionStatus === 'manual_required'
                ? 'Manual conversion needed'
                : 'Waiting for admin conversion'}
        </p>
        {feedback ? (
          <p className={`max-w-72 text-[11px] ${failed ? 'text-warn' : 'text-ok'}`}>{feedback}</p>
        ) : null}
      </div>
    </>
  );
}
