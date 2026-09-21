import 'server-only';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { OcrBlock, OcrResult } from './types';

/**
 * Turns an OCR result into a PDF document with the same content layout as the
 * Word draft. Unlike the Word output the PDF is read-only — it exists for
 * schools or admins that prefer to distribute printed lists directly as a PDF
 * instead of editing a Word file.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

const PURPLE = rgb(76 / 255, 29 / 255, 149 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const RULE = rgb(229 / 255, 231 / 255, 235 / 255);
const HEADER_FILL = rgb(243 / 255, 240 / 255, 255 / 255);

const LINE_HEIGHT = 14;
const TABLE_LINE_HEIGHT = 11;
const MAX_CELL_LINES = 4;

interface LayoutDoc {
  pdf: PDFDocument;
  bold: PDFFont;
  regular: PDFFont;
  italic: PDFFont;
  pages: PDFPage[];
  y: number;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxW) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function newPage(doc: LayoutDoc): void {
  doc.pages.push(doc.pdf.addPage([PAGE_W, PAGE_H]));
  doc.y = PAGE_H - MARGIN;
  drawPageHeader(doc);
}

function drawPageHeader(doc: LayoutDoc): void {
  const page = doc.pages[doc.pages.length - 1]!;
  page.drawText('Fazoo · booklist draft', {
    x: PAGE_W - MARGIN,
    y: PAGE_H - MARGIN + 4,
    size: 8,
    font: doc.italic,
    color: MUTED,
  });
}

function ensureRoom(doc: LayoutDoc, height: number): void {
  if (doc.y - height < MARGIN) newPage(doc);
}

function drawWrapped(
  doc: LayoutDoc,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxW = CONTENT_W,
  indent = 0,
): void {
  const lines = wrap(text, font, size, maxW - indent);
  for (const line of lines) {
    ensureRoom(doc, LINE_HEIGHT);
    doc.pages[doc.pages.length - 1]!.drawText(line, {
      x: MARGIN + indent,
      y: doc.y - size,
      size,
      font,
      color,
    });
    doc.y -= LINE_HEIGHT;
  }
}

function drawRule(doc: LayoutDoc): void {
  ensureRoom(doc, LINE_HEIGHT * 2);
  const page = doc.pages[doc.pages.length - 1]!;
  const y = doc.y + 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: RULE,
    opacity: 1,
  });
  doc.y -= LINE_HEIGHT;
}

function drawTable(doc: LayoutDoc, rows: string[][]): void {
  if (rows.length === 0) return;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const colW = CONTENT_W / colCount;
  const pad = 6;

  for (let ri = 0; ri < rows.length; ri += 1) {
    const row = rows[ri] ?? [];
    const isHeader = ri === 0;

    // pre-wrap every cell to find row height
    const cellLines: string[][][] = [];
    let rowH = 0;
    for (let ci = 0; ci < colCount; ci += 1) {
      const raw = row[ci] ?? '';
      const lines = wrap(raw, doc.regular, 9, colW - pad * 2).slice(0, MAX_CELL_LINES);
      if (raw !== lines.join(' ')) lines[lines.length - 1] += '…';
      cellLines.push(lines.map((l) => [l]));
      const h = lines.length * TABLE_LINE_HEIGHT + pad * 2;
      if (h > rowH) rowH = h;
    }

    ensureRoom(doc, rowH + 1);
    const page = doc.pages[doc.pages.length - 1]!;
    const baseY = doc.y;

    for (let ci = 0; ci < colCount; ci += 1) {
      const x = MARGIN + ci * colW;
      // cell background
      page.drawRectangle({
        x,
        y: baseY - rowH,
        width: colW,
        height: rowH,
        borderColor: RULE,
        borderWidth: 0.5,
        color: isHeader ? HEADER_FILL : undefined,
      });
      // text
      const lines = cellLines[ci]!;
      for (let li = 0; li < lines.length; li += 1) {
        page.drawText(lines[li]?.[0] ?? '', {
          x: x + pad,
          y: baseY - pad - TABLE_LINE_HEIGHT * (li + 1),
          size: 9,
          font: isHeader ? doc.bold : doc.regular,
          color: rgb(0, 0, 0),
        });
      }
    }

    doc.y = baseY - rowH;
  }
  doc.y -= LINE_HEIGHT;
}

function blocksToDoc(doc: LayoutDoc, blocks: OcrBlock[]): void {
  for (const block of blocks) {
    if (block.kind === 'heading') {
      ensureRoom(doc, LINE_HEIGHT * 2.5);
      doc.y -= LINE_HEIGHT;
      drawWrapped(doc, block.text, doc.bold, 13, PURPLE);
    } else if (block.kind === 'table') {
      drawTable(doc, block.rows);
    } else {
      drawWrapped(doc, block.text, doc.regular, 11, rgb(0, 0, 0));
    }
  }
}

function drawFooters(doc: LayoutDoc): void {
  const total = doc.pages.length;
  for (let i = 0; i < total; i += 1) {
    const page = doc.pages[i]!;
    page.drawText(`Page ${i + 1} of ${total}`, {
      x: (PAGE_W - doc.bold.widthOfTextAtSize(`Page ${i + 1} of ${total}`, 8)) / 2,
      y: MARGIN - 20,
      size: 8,
      font: doc.italic,
      color: MUTED,
    });
  }
}

export interface PdfContext {
  schoolName: string;
  schoolRegion: string | null;
  isPerGrade: boolean;
  gradeNotes: string | null;
  gradeLabel?: string | null;
  baName: string | null;
  generatedAt: Date;
}

export async function buildBooklistPdf(
  result: OcrResult,
  context: PdfContext,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const doc: LayoutDoc = { pdf, bold, regular, italic, pages: [], y: PAGE_H - MARGIN };
  newPage(doc);

  const title = context.gradeLabel
    ? `${context.schoolName} — ${context.gradeLabel} Book List`
    : `${context.schoolName} — Book List`;
  const subtitle = [
    context.schoolRegion ? `Region: ${context.schoolRegion}` : null,
    context.isPerGrade ? 'Issued per grade' : 'Single school-wide list',
    context.gradeNotes ? `Grades: ${context.gradeNotes}` : null,
    context.baName ? `Collected by: ${context.baName}` : null,
  ]
    .filter(Boolean)
    .join('   •   ');

  // Title
  ensureRoom(doc, LINE_HEIGHT * 3);
  doc.y -= LINE_HEIGHT;
  drawWrapped(doc, title, bold, 18, PURPLE);
  doc.y -= LINE_HEIGHT * 0.5;

  // Subtitle
  if (subtitle) drawWrapped(doc, subtitle, italic, 9, MUTED);
  doc.y -= LINE_HEIGHT * 0.5;
  drawRule(doc);

  // Note
  drawWrapped(
    doc,
    `Machine-generated draft — OCR confidence ${result.confidence.toFixed(0)}%, ` +
      `${result.pageCount} page(s), ${context.generatedAt.toISOString().slice(0, 10)}. ` +
      'Review and reformat before publishing to the BA.',
    italic,
    8.5,
    MUTED,
  );
  doc.y -= LINE_HEIGHT;

  blocksToDoc(doc, result.blocks);

  drawFooters(doc);

  return pdf.save();
}