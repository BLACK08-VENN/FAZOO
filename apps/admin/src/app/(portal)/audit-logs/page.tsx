import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { formatLagosDisplay } from '@fazoo/config';

export default async function AuditLogsPage() {
  const { client } = await requireStaff();

  const { data: logs } = await client
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, metadata, created_at, profiles ( full_name )')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader title="Audit Logs" description="Sensitive actions across your organization." />

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Metadata</Th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).length === 0 ? (
              <EmptyRow colSpan={5}>No audit entries yet.</EmptyRow>
            ) : (
              (logs ?? []).map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap">{formatLagosDisplay(l.created_at)}</Td>
                  <Td>{l.profiles?.full_name ?? 'system'}</Td>
                  <Td className="font-mono text-xs">{l.action}</Td>
                  <Td className="font-mono text-xs">
                    {l.entity_type}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 8)}` : ''}
                  </Td>
                  <Td className="max-w-72 truncate font-mono text-xs text-muted">
                    {l.metadata ? JSON.stringify(l.metadata) : '—'}
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
