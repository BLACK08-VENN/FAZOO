import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TESSERACT_VERSION = '5.1.1';
const CORE_VERSION = '5.1.1';
const PDFJS_VERSION = '3.11.174';

const STATIC_ASSETS: Record<string, { url: string; contentType: string }> = {
  'tesseract.min.js': {
    url: `https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/${TESSERACT_VERSION}/tesseract.min.js`,
    contentType: 'application/javascript; charset=utf-8',
  },
  'worker.min.js': {
    url: `https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/${TESSERACT_VERSION}/worker.min.js`,
    contentType: 'application/javascript; charset=utf-8',
  },
  'pdf.min.js': {
    url: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,
    contentType: 'application/javascript; charset=utf-8',
  },
  'pdf.worker.min.js': {
    url: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`,
    contentType: 'application/javascript; charset=utf-8',
  },
};

const CORE_ASSETS = new Set([
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
]);

function resolveAsset(parts: string[]): { url: string; contentType: string } | null {
  const joined = parts.join('/');
  if (STATIC_ASSETS[joined]) return STATIC_ASSETS[joined];

  const coreAsset = parts[1];
  if (parts.length === 2 && parts[0] === 'core' && coreAsset && CORE_ASSETS.has(coreAsset)) {
    return {
      url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/${coreAsset}`,
      contentType: 'application/javascript; charset=utf-8',
    };
  }

  if (parts.length === 2 && parts[0] === 'lang' && parts[1] === 'eng.traineddata.gz') {
    return {
      url: 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
      contentType: 'application/gzip',
    };
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string[] }> },
) {
  const { asset } = await params;
  const resolved = resolveAsset(asset);
  if (!resolved) {
    return NextResponse.json({ error: 'OCR asset not found' }, { status: 404 });
  }

  try {
    const upstream = await fetch(resolved.url, {
      cache: 'force-cache',
      headers: { 'User-Agent': 'FAZOO-OCR/1.0' },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `OCR asset provider returned ${upstream.status}` },
        { status: 502 },
      );
    }

    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || resolved.contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load OCR asset';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
