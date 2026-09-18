import part1 from '@/lib/pink-stuff-logo/part1';
import part2 from '@/lib/pink-stuff-logo/part2';
import part3 from '@/lib/pink-stuff-logo/part3';
import part4 from '@/lib/pink-stuff-logo/part4';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

const PNG_BASE64 = part1 + part2 + part3 + part4;

export async function GET(): Promise<Response> {
  const bytes = Buffer.from(PNG_BASE64, 'base64');

  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
