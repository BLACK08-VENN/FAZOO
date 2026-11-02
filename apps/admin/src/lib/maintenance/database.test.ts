import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const admin = '10000000-0000-4000-8000-000000000001';
const tech = '10000000-0000-4000-8000-000000000002';
const reporter = '10000000-0000-4000-8000-000000000003';
const stranger = '10000000-0000-4000-8000-000000000004';
const outsider = '10000000-0000-4000-8000-000000000005';
const orgA = '30000000-0000-4000-8000-000000000001';
const orgB = '30000000-0000-4000-8000-000000000002';
const db = new PGlite();
async function as(uid: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`,
  );
}
async function mutate(command: Record<string, unknown>, requestId = crypto.randomUUID()) {
  const result = await db.query<{ result: { id: string; version: number } }>(
    'select public.maintenance_mutate($1,$2::jsonb) as result',
    [requestId, JSON.stringify(command)],
  );
  return result.rows[0]!.result;
}
async function workspace() {
  const result = await db.query<{
    result: {
      jobs: Array<{ id: string; status: string; events: unknown[] }>;
      technicians: unknown[];
    };
  }>('select public.maintenance_workspace() as result');
  return result.rows[0]!.result;
}
let job = '';
let requestId = '';
const request = {
  action: 'create',
  title: 'Inspect the cooling unit',
  description: 'The unit is making an unusual noise during operation.',
  location: 'Fictional test site, room A',
  priority: 'high',
};
const assign = () => ({
  action: 'assign',
  job_id: job,
  expected_version: 1,
  technician_id: tech,
  due_at: new Date(Date.now() + 86400000).toISOString(),
  instructions: 'Inspect and safely repair the cooling unit.',
});

describe.sequential('Maintenance migration on isolated PostgreSQL (PGlite)', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create table organizations(id uuid primary key, status text not null);
      create table profiles(id uuid primary key,organization_id uuid references organizations(id),full_name text,role text,account_status text);
      create table operation_receipts(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,client_request_id uuid unique,operation text,result jsonb,created_at timestamptz default now());
      create table audit_logs(id uuid default gen_random_uuid(),organization_id uuid,actor_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz default now());
      create function current_profile() returns table(id uuid,organization_id uuid,role text,account_status text) language sql stable security definer set search_path='' as $$ select id,organization_id,role,account_status from public.profiles where id=auth.uid() $$;
      create function check_rate_limit(text,int,int) returns boolean language sql as $$ select true $$;
      grant select on organizations to authenticated;
      insert into organizations values('${orgA}','active'),('${orgB}','active');
      insert into profiles values
        ('${admin}','${orgA}','Test administrator','organization_admin','approved'),
        ('${tech}','${orgA}','Test technician','brand_ambassador','approved'),
        ('${reporter}','${orgA}','Test requester','client','approved'),
        ('${stranger}','${orgA}','Other technician','brand_ambassador','approved'),
        ('${outsider}','${orgB}','Other company administrator','organization_admin','approved');
    `);
    const migration = fileURLToPath(
      new URL(
        '../../../../../supabase/migrations/20261102123815_maintenance_service_workflow.sql',
        import.meta.url,
      ),
    );
    await db.exec(readFileSync(migration, 'utf8'));
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  it('denies anonymous RPC and table access', async () => {
    await db.exec('set role anon;');
    await expect(db.query('select maintenance_workspace()')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query('select * from maintenance_jobs')).rejects.toThrow(
      /permission denied/,
    );
  });
  it('derives ownership from the authenticated requester', async () => {
    await as(reporter);
    requestId = crypto.randomUUID();
    job = (
      await mutate({ ...request, organization_id: orgB, reported_by: outsider }, requestId)
    ).id;
    const rows = await db.query<{ organization_id: string; reported_by: string }>(
      'select organization_id,reported_by from maintenance_jobs where id=$1',
      [job],
    );
    expect(rows.rows[0]).toEqual({ organization_id: orgA, reported_by: reporter });
  });
  it('replays the same request without another job or audit event', async () => {
    const result = await mutate(
      { ...request, organization_id: orgB, reported_by: outsider },
      requestId,
    );
    expect(result.id).toBe(job);
    expect((await workspace()).jobs).toHaveLength(1);
    expect((await workspace()).jobs[0]?.events).toHaveLength(1);
  });
  it('rejects reuse of a receipt with different input or another actor', async () => {
    await expect(mutate({ ...request, title: 'Different issue' }, requestId)).rejects.toThrow(
      /identifier already used/,
    );
    await as(admin);
    await expect(
      mutate({ ...request, organization_id: orgB, reported_by: outsider }, requestId),
    ).rejects.toThrow(/identifier already used/);
  });
  it('hides jobs and events from another organization and an unrelated technician', async () => {
    for (const uid of [outsider, stranger]) {
      await as(uid);
      expect((await workspace()).jobs).toEqual([]);
      expect((await db.query('select * from maintenance_jobs')).rows).toEqual([]);
      expect((await db.query('select * from maintenance_events')).rows).toEqual([]);
    }
  });
  it('denies direct inserts and updates even to organization administrators', async () => {
    await as(admin);
    await expect(db.query("update maintenance_jobs set status='completed'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query(
        "insert into maintenance_events(job_id,actor_id,action,note) values($1,$2,'approve','Bypass review')",
        [job, admin],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it('blocks assignment by requesters and cross-organization administrators', async () => {
    await as(reporter);
    await expect(mutate(assign())).rejects.toThrow(/not permitted/);
    await as(outsider);
    await expect(mutate(assign())).rejects.toThrow(/not found/);
  });
  it('blocks cross-organization and client technician assignments', async () => {
    await as(admin);
    for (const id of [outsider, reporter])
      await expect(mutate({ ...assign(), technician_id: id })).rejects.toThrow(
        /approved technician/,
      );
  });
  it('requires a future deadline and instructions', async () => {
    await expect(mutate({ ...assign(), due_at: '2000-01-01T00:00:00Z' })).rejects.toThrow(
      /future deadline/,
    );
    await expect(mutate({ ...assign(), instructions: '' })).rejects.toThrow(/instructions/);
  });
  it('creates an assigned work order and exposes it to its technician', async () => {
    expect((await mutate(assign())).version).toBe(2);
    await as(tech);
    expect((await workspace()).jobs[0]?.id).toBe(job);
    expect((await workspace()).technicians).toEqual([]);
  });
  it('rejects stale writes and unauthorized technician updates', async () => {
    await expect(
      mutate({
        action: 'update',
        job_id: job,
        expected_version: 1,
        status: 'in_progress',
        note: 'Starting the inspection.',
      }),
    ).rejects.toThrow(/changed/);
    await as(stranger);
    await expect(
      mutate({
        action: 'update',
        job_id: job,
        expected_version: 2,
        status: 'in_progress',
        note: 'Starting the inspection.',
      }),
    ).rejects.toThrow(/assigned technician/);
  });
  it('prevents skipping directly from assigned to submitted', async () => {
    await as(tech);
    await expect(
      mutate({
        action: 'update',
        job_id: job,
        expected_version: 2,
        status: 'ready_for_review',
        note: 'Claiming work complete.',
      }),
    ).rejects.toThrow(/transition/);
  });
  it('supports starting work, parts delays, resuming and submission', async () => {
    for (const [version, status, note] of [
      [2, 'in_progress', 'Started inspection.'],
      [3, 'awaiting_parts', 'Waiting for replacement part.'],
      [4, 'in_progress', 'Part arrived; resuming repair.'],
      [5, 'ready_for_review', 'Repaired and tested the unit successfully.'],
    ] as const) {
      await mutate({ action: 'update', job_id: job, expected_version: version, status, note });
    }
    expect((await workspace()).jobs[0]?.status).toBe('ready_for_review');
  });
  it('requires a separate reviewer and an actual review note', async () => {
    await expect(
      mutate({
        action: 'approve',
        job_id: job,
        expected_version: 6,
        note: 'I approve my work.',
      }),
    ).rejects.toThrow(/independent administrator/);
    await as(admin);
    await expect(
      mutate({ action: 'approve', job_id: job, expected_version: 6, note: '' }),
    ).rejects.toThrow(/note/);
  });
  it('reopens submitted work, requires a new submission and approves completion', async () => {
    await mutate({
      action: 'reopen',
      job_id: job,
      expected_version: 6,
      note: 'Please complete another operating test.',
    });
    await expect(
      mutate({
        action: 'approve',
        job_id: job,
        expected_version: 7,
        note: 'Attempt early approval.',
      }),
    ).rejects.toThrow(/independent administrator/);
    await as(tech);
    await mutate({
      action: 'update',
      job_id: job,
      expected_version: 7,
      status: 'ready_for_review',
      note: 'Completed additional testing; all checks passed.',
    });
    await as(admin);
    await mutate({
      action: 'approve',
      job_id: job,
      expected_version: 8,
      note: 'Reviewed the tests and approved the work.',
    });
    expect((await workspace()).jobs[0]?.status).toBe('completed');
  });
  it('locks completed jobs against technician progress edits', async () => {
    await as(tech);
    await expect(
      mutate({
        action: 'update',
        job_id: job,
        expected_version: 9,
        status: 'in_progress',
        note: 'Trying to change a completed job.',
      }),
    ).rejects.toThrow(/transition/);
  });
  it('also prevents self-approval when the technician is an administrator', async () => {
    await as(admin);
    const own = (await mutate(request)).id;
    await mutate({ ...assign(), job_id: own, technician_id: admin });
    await mutate({
      action: 'update',
      job_id: own,
      expected_version: 2,
      status: 'in_progress',
      note: 'Beginning my assigned work.',
    });
    await mutate({
      action: 'update',
      job_id: own,
      expected_version: 3,
      status: 'ready_for_review',
      note: 'Work is complete and tested.',
    });
    await expect(
      mutate({
        action: 'approve',
        job_id: own,
        expected_version: 4,
        note: 'Attempting to approve my own job.',
      }),
    ).rejects.toThrow(/independent administrator/);
  });
  it('rejects a suspended account, including receipt replay', async () => {
    await db.exec(
      `reset role; update profiles set account_status='suspended' where id='${reporter}';`,
    );
    await as(reporter);
    await expect(workspace()).rejects.toThrow(/Approved active/);
    await expect(
      mutate({ ...request, organization_id: orgB, reported_by: outsider }, requestId),
    ).rejects.toThrow(/Approved active/);
  });
  it('rejects inactive organization access', async () => {
    await db.exec(
      `reset role; update organizations set status='suspended' where id='${orgA}';`,
    );
    await as(admin);
    await expect(workspace()).rejects.toThrow(/Approved active/);
  });
});
