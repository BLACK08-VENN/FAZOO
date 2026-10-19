import { NextResponse } from 'next/server';

// Disabled at the HTTP boundary: no provider calls or document parsing.
export async function POST() {
  return NextResponse.json(
    { error: 'OCR is temporarily disabled. Upload a prepared document instead.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
