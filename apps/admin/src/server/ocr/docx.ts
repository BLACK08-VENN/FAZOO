import 'server-only';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { OcrBlock, OcrResult } from './types';

/**
 * Turns an OCR result into an editable Word draft.
 *
 * The output is intentionally a faithful draft, not a finished booklist: the
 * admin reviews, corrects handwriting misreads and applies the house template
 * before publishing. What matters is that nothing has to be retyped.
 */

const BRAND_PURPLE = '4C1D95';
const MUTED = '6B7280';
const RULE = 'E5E7EB';

export interface DocxContext {
  schoolName: string;
  schoolRegion: string | null;
  isPerGrade: boolean;
  gradeNotes: string | null;
  baName: string | null;
  generatedAt: Date;
}

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND_PURPLE })],
  });
}

function paragraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function tableBlock(rows: string[][]): Table {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const width = Math.floor(9000 / Math.max(columnCount, 1));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: columnCount }, (_, columnIndex) => {
            const value = row[columnIndex] ?? '';
            return new TableCell({
              width: { size: width, type: WidthType.DXA },
              shading: rowIndex === 0 ? { fill: 'F3F0FF' } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({ text: value, bold: rowIndex === 0, size: 20 }),
                  ],
                }),
              ],
            });
          }),
        }),
    ),
  });
}

function blocksToChildren(blocks: OcrBlock[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    if (block.kind === 'table') {
      children.push(tableBlock(block.rows));
      // Word requires a paragraph between adjacent tables or they merge.
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    } else if (block.kind === 'heading') {
      children.push(heading(block.text));
    } else {
      children.push(paragraph(block.text));
    }
  }
  return children;
}

export async function buildBooklistDocx(
  result: OcrResult,
  context: DocxContext,
): Promise<Uint8Array> {
  const title = `${context.schoolName} — Book List`;
  const subtitle = [
    context.schoolRegion ? `Region: ${context.schoolRegion}` : null,
    context.isPerGrade ? 'Issued per grade' : 'Single school-wide list',
    context.gradeNotes ? `Grades: ${context.gradeNotes}` : null,
    context.baName ? `Collected by: ${context.baName}` : null,
  ]
    .filter(Boolean)
    .join('   •   ');

  const document = new Document({
    creator: 'Fazoo',
    title,
    description: `Editable booklist draft for ${context.schoolName}, generated from a ${result.provider} OCR pass.`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { color: RULE, space: 4, style: 'single', size: 6 } },
                children: [
                  new TextRun({ text: 'Fazoo · booklist draft', size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
                  new TextRun({ text: ' of ', size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: title, bold: true, size: 36, color: BRAND_PURPLE })],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: subtitle, size: 18, color: MUTED })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            border: { bottom: { color: RULE, space: 6, style: 'single', size: 6 } },
            children: [
              new TextRun({
                text: `Machine-generated draft — OCR confidence ${result.confidence.toFixed(0)}%, ` +
                  `${result.pageCount} page(s), ${context.generatedAt.toISOString().slice(0, 10)}. ` +
                  'Review and reformat before publishing to the BA.',
                italics: true,
                size: 16,
                color: MUTED,
              }),
            ],
          }),
          ...blocksToChildren(result.blocks),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
