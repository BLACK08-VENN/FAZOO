import Link from 'next/link';
import type { OcrStatus } from '@fazoo/types';
import { sourceFormatLabel } from '@fazoo/config';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge, OcrBadge, StageBadge } from '@/components/stage-badge';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { nairobiTime, NOT_YET } from '@/lib/format';
import { conversionQueue } from '@/server/booklists';

const OCR_FILTERS: ReadonlyArray<{ value: OcrStatus | ''; label: string }> = [
  { value: '', label: 'Everything waiting' },
  { value: 'queued', label: 'Queued — not yet attempted' },
  { value: 'processing', label: 'Converting now' },
  { value: 'succeeded', label: 'Auto-converted — needs formatting' },
  { value: 'manual_required', label: 'Needs manual conversion' },
  { value: 'failed', label: 'Auto-conversion failed' },
];

function isOcrStatus(value: string | undefined): value is OcrStatus {
  return (
    value === 'not_required' ||
    value === 'queued' ||
    value === 'processing' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'manual_required'
  );
}

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return NOT_YET;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The admin's worklist: every school whose booklist has arrived but whose
 * formatted Word document has not been published yet. Oldest first, so nothing
 * sits at the bottom of the pile while a BA waits at a school.
 */
export default async function ConversionQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ ocr?: string }>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const ocrFilter = isOcrStatus(params.ocr) ? params.ocr : null;

  const result = await conversionQueue(client, { ocrStatus: ocrFilter, limit: 200 });
  const { queue, counts } = result;

  return (
    <>
      <PageHeader
        title="Conversion queue"
        description="Booklists the school has handed over that still need an editable, formatted Word document before the BA can print them."
      >
        <Link
          href="/booklists"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Back to pipeline
        </Link>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Awaiting conversion" value={counts.awaiting_conversion} />
        <StatCard label="Converting" value={counts.converting} />
        <StatCard
          label="Auto-conversion failed"
          value={counts.ocr_failed}
          hint="Format these by hand."
        />
        <StatCard
          label="Needs manual conversion"
          value={counts.manual_required}
          hint="Low confidence or no OCR provider configured."
        />
        <StatCard
          label="Formatted, ready to print"
          value={counts.formatted_ready}
          hint="Waiting on the BA to collect and print."
        />
      </div>

      <Card className="mb-5 p-4">
        <form
          method="get"
          action="/booklists/conversion"
          role="search"
          aria-label="Filter the conversion queue"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="sm:max-w-xs sm:flex-1">
            <Label htmlFor="cq-ocr">Conversion state</Label>
            <Select id="cq-ocr" name="ocr" defaultValue={ocrFilter ?? ''}>
              {OCR_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-none"
            >
              Apply
            </button>
            <Link
              href="/booklists/conversion"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <TableWrap>
        <Table>
          <caption className="sr-only">Booklist documents waiting to be converted and formatted</caption>
          <thead>
            <tr>
              <Th>School</Th>
              <Th>Stage</Th>
              <Th>Received</Th>
              <Th>Handed over as</Th>
              <Th>Conversion</Th>
              <Th>Brand ambassador</Th>
              <Th><span className="sr-only">Open</span></Th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <EmptyRow colSpan={7}>
                {counts.awaiting_conversion + counts.converting === 0
                  ? 'Nothing is waiting. Every booklist received so far has a formatted document.'
                  : 'No documents match that conversion state.'}
              </EmptyRow>
            ) : (
              queue.map((item) => (
                <tr key={item.job_id} className="transition-colors hover:bg-lavender/40">
                  <Td>
                    <Link
                      href={`/booklists/${item.job_id}`}
                      className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {item.school_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">{item.school_region ?? 'Region not recorded'}</p>
                  </Td>
                  <Td>
                    <StageBadge stage={item.stage} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {item.document_received_at ? nairobiTime(item.document_received_at) : NOT_YET}
                  </Td>
                  <Td className="text-xs">
                    {item.document_id ? (
                      <>
                        {sourceFormatLabel(item.source_format)}
                        <p className="text-muted">
                          {fileSizeLabel(item.file_size_bytes)}
                          {item.page_count ? ` · ${item.page_count} pages` : ''}
                        </p>
                      </>
                    ) : (
                      <span className="font-medium text-warn">Upload still pending</span>
                    )}
                  </Td>
                  <Td>
                    <OcrBadge status={item.ocr_status} />
                    {item.ocr_confidence !== null ? (
                      <p className="mt-1 text-xs text-muted">
                        {item.ocr_provider ?? 'provider not recorded'} ·{' '}
                        {(item.ocr_confidence * 100).toFixed(0)}% confidence
                      </p>
                    ) : null}
                    {item.ocr_error ? (
                      <p className="mt-1 max-w-xs text-xs font-medium text-bad">{item.ocr_error}</p>
                    ) : null}
                  </Td>
                  <Td className="text-xs">
                    {item.ba_name ?? <span className="text-muted">Unassigned</span>}
                    <div className="mt-1">
                      <AgencyBadge agency={item.ba_agency} />
                    </div>
                  </Td>
                  <Td>
                    <Link
                      href={`/booklists/${item.job_id}`}
                      className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-3 text-xs font-medium text-primary hover:bg-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Convert
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Conversion queue — Fazoo' };
}
