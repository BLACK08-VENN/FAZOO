import Link from 'next/link';
import { sourceFormatLabel } from '@fazoo/config';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { nairobiTime, NOT_YET } from '@/lib/format';
import { documentPreparationQueue } from '@/server/booklists';

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return NOT_YET;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentPreparationPage() {
  const { client } = await requireStaff();
  const { queue, counts } = await documentPreparationQueue(client, { limit: 200 });
  return (
    <>
      <PageHeader
        title="Document preparation"
        description="Download the original booklist, prepare a corrected Word or PDF document, and upload it for school approval."
      >
        <Link
          href="/booklists"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Back to pipeline
        </Link>
      </PageHeader>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Awaiting prepared document" value={counts.awaiting_preparation} />
        <StatCard label="Original upload pending" value={counts.missing_original} />
        <StatCard label="Prepared documents published" value={counts.formatted_ready} />
      </div>
      <p className="mb-4 text-sm text-muted">
        Showing the oldest {queue.length} pending jobs
        {counts.awaiting_preparation > queue.length
          ? ` of ${counts.awaiting_preparation}. Open the pipeline to find other schools.`
          : '.'}
      </p>
      <TableWrap>
        <Table>
          <caption className="sr-only">Booklists waiting for prepared documents</caption>
          <thead>
            <tr>
              <Th>School</Th>
              <Th>Stage</Th>
              <Th>Received</Th>
              <Th>Original document</Th>
              <Th>Brand ambassador</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <EmptyRow colSpan={6}>
                No booklists are waiting for document preparation.
              </EmptyRow>
            ) : (
              queue.map((item) => (
                <tr key={item.job_id}>
                  <Td>
                    <Link
                      href={`/booklists/${item.job_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.school_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {item.school_region ?? 'Region not recorded'}
                    </p>
                  </Td>
                  <Td>
                    <StageBadge stage={item.stage} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {item.document_received_at
                      ? nairobiTime(item.document_received_at)
                      : NOT_YET}
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
                      <span className="font-medium text-warn">Upload pending</span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {item.ba_name ?? 'Unassigned'}
                    <div className="mt-1">
                      <AgencyBadge agency={item.ba_agency} />
                    </div>
                  </Td>
                  <Td>
                    <Link
                      href={`/booklists/${item.job_id}`}
                      className="inline-flex min-h-10 items-center rounded-lg border border-primary/30 bg-white px-3 text-xs font-medium text-primary hover:bg-lavender"
                    >
                      Prepare document
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
export const metadata = { title: 'Document preparation — Fazoo' };
