import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'OCR is temporarily disabled.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
