import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const org = '30000000-0000-4000-8000-000000000001';
const otherOrg = '30000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000001';
const worker = '10000000-0000-4000-8000-000000000002';
const stranger = '10000000-0000-4000-8000-000000000003';
const outsider = '10000000-0000-4000-8000-000000000004';
const client = '10000000-0000-4000-8000-000000000005';
const campaign = '40000000-0000-4000-8000-000000000001';
const foreignCampaign = '40000000-0000-4000-8000-000000000002';
const db = new PGlite();
let task = '';
const create = {
  action: 'create',
  campaign_id: campaign,
  assigned_to: worker,
  kind: 'delivery',
  title: 'Deliver display materials',
  instructions: 'Count the stands and record the recipient.',
  origin: 'Central dispatch',
  destination: 'Test store A',
  priority: 'high',
  due_at: new Date(Date.now() + 86400000).toISOString(),
  items: [{ name: 'Stand', quantity: 3 }],
};
async function as(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function mutate(command: Record<string, unknown>, receipt = crypto.randomUUID()) {
  const result = await db.query<{ result: { id: string; version: number } }>(
    'select operations_mutate($1,$2::jsonb) result',
    [receipt, JSON.stringify(command)],
  );
  return result.rows[0]!.result;
}
async function workspace() {
  const result = await db.query<{
    result: {
      tasks: { id: string; status: string; version: number; evidence: string[] }[];
      workers: unknown[];
    };
  }>('select operations_workspace() result');
  return result.rows[0]!.result;
}
const update = (version: number, status: string, extra = {}) => ({
  action: 'update',
  task_id: task,
  expected_version: version,
  status,
  note: 'The materials have been checked.',
  recipient: '',
  actual_items: [],
  evidence: [],
  ...extra,
});

describe.sequential('Operations exact migration / PostgreSQL permissions', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,storage to authenticated,anon;
      create table organizations(id uuid primary key,status text);
      create table profiles(id uuid primary key,organization_id uuid references organizations(id),full_name text,role text,account_status text);
      create table campaigns(id uuid primary key,organization_id uuid references organizations(id),name text,status text);
      create table operation_receipts(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,client_request_id uuid unique,operation text,result jsonb,created_at timestamptz default now());
      create table audit_logs(id uuid default gen_random_uuid(),organization_id uuid,actor_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz default now());
      create function check_rate_limit(text,int,int) returns boolean language sql as $$ select true $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert on storage.objects to authenticated;
      insert into organizations values('${org}','active'),('${otherOrg}','active');
      insert into profiles values
      ('${admin}','${org}','Test manager','organization_admin','approved'),
      ('${worker}','${org}','Test worker','brand_ambassador','approved'),
      ('${stranger}','${org}','Other worker','supervisor','approved'),
      ('${outsider}','${otherOrg}','Other manager','super_admin','approved'),
      ('${client}','${org}','Test client','client','approved');
      insert into campaigns values('${campaign}','${org}','Test campaign','active'),('${foreignCampaign}','${otherOrg}','Other campaign','active');
    `);
    await db.exec(
      readFileSync(
        new URL(
          '../../../../../supabase/migrations/20261105130826_daily_operations_tracking.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  afterAll(async () => db.close());
  it('denies anonymous and client access', async () => {
    await db.exec('set role anon');
    await expect(db.query('select operations_workspace()')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query('select * from operations_tasks')).rejects.toThrow(
      /permission denied/,
    );
    await as(client);
    await expect(workspace()).rejects.toThrow(/membership required/);
    await expect(mutate(create)).rejects.toThrow(/membership required/);
  });
  it('requires an administrator, same-organization campaign and approved worker', async () => {
    await as(worker);
    await expect(mutate(create)).rejects.toThrow(/administrators/);
    await as(admin);
    await expect(mutate({ ...create, campaign_id: foreignCampaign })).rejects.toThrow(
      /active campaign/,
    );
    await expect(mutate({ ...create, assigned_to: outsider })).rejects.toThrow(
      /approved worker/,
    );
    await expect(mutate({ ...create, assigned_to: client })).rejects.toThrow(/approved worker/);
  });
  it('validates deadlines, items and delivery origin in SQL', async () => {
    await expect(mutate({ ...create, due_at: '2000-01-01T00:00:00Z' })).rejects.toThrow(
      /future deadline/,
    );
    await expect(
      mutate({ ...create, items: [{ name: 'Stand', quantity: -1 }] }),
    ).rejects.toThrow(/Invalid item/);
    await expect(
      mutate({ ...create, items: [{ name: 'Stand', quantity: 1.5 }] }),
    ).rejects.toThrow(/Invalid item/);
    await expect(mutate({ ...create, items: [] })).rejects.toThrow(/origin and items/);
    await expect(mutate({ ...create, origin: '' })).rejects.toThrow(/origin and items/);
  });
  it('derives ownership, creates one audited allocation, and safely replays retries', async () => {
    const receipt = crypto.randomUUID();
    const payload = { ...create, organization_id: otherOrg, created_by: outsider };
    const first = await mutate(payload, receipt);
    task = first.id;
    expect(await mutate(payload, receipt)).toEqual(first);
    expect((await workspace()).tasks).toHaveLength(1);
    const row = await db.query('select organization_id,created_by from operations_tasks');
    expect(row.rows).toEqual([{ organization_id: org, created_by: admin }]);
    await expect(mutate({ ...payload, title: 'Different task' }, receipt)).rejects.toThrow(
      /identifier already used/,
    );
    await as(worker);
    await expect(mutate(payload, receipt)).rejects.toThrow(/identifier already used/);
    await db.exec('reset role');
    expect((await db.query('select * from audit_logs')).rows).toHaveLength(1);
    expect((await db.query('select * from operations_events')).rows).toHaveLength(1);
  });
  it('hides tasks, events and workers from unrelated users and other organizations, including super admins', async () => {
    for (const id of [stranger, outsider]) {
      await as(id);
      expect((await workspace()).tasks).toEqual([]);
      expect((await db.query('select * from operations_tasks')).rows).toEqual([]);
      expect((await db.query('select * from operations_events')).rows).toEqual([]);
      await expect(mutate(update(1, 'in_progress'))).rejects.toThrow(
        id === outsider ? /not found/ : /assigned worker/,
      );
    }
  });
  it('denies direct mutation and rejects stale updates and skipping work', async () => {
    await as(admin);
    await expect(db.query("update operations_tasks set status='completed'")).rejects.toThrow(
      /permission denied/,
    );
    await as(worker);
    expect((await workspace()).workers).toEqual([]);
    await expect(mutate(update(99, 'in_progress'))).rejects.toThrow(/changed/);
    await expect(mutate(update(1, 'ready_for_review'))).rejects.toThrow(/transition/);
    await mutate(update(1, 'in_progress'));
  });
  it('records a blocked issue, requires resuming work before submitting', async () => {
    await mutate(update(2, 'blocked', { note: 'Recipient unavailable at this location.' }));
    expect((await workspace()).tasks[0]?.status).toBe('blocked');
    await expect(mutate(update(3, 'ready_for_review'))).rejects.toThrow(/transition/);
    await mutate(update(3, 'in_progress'));
  });
  it('requires actual quantities, acknowledgement and task-owned evidence', async () => {
    await expect(mutate(update(4, 'ready_for_review'))).rejects.toThrow(/actual items/);
    const details = {
      actual_items: [{ name: 'Stand', quantity: 2 }],
      recipient: 'Test recipient',
    };
    await expect(
      mutate(
        update(4, 'ready_for_review', { ...details, evidence: ['foreign/task/photo.jpg'] }),
      ),
    ).rejects.toThrow(/Evidence/);
    await expect(
      mutate(
        update(4, 'ready_for_review', {
          ...details,
          evidence: [`${org}/${campaign}/${task}/missing.jpg`],
        }),
      ),
    ).rejects.toThrow(/Evidence/);
  });
  it('keeps photo storage private and scoped to the assigned active task', async () => {
    const path = `${org}/${campaign}/${task}/proof.jpg`;
    await as(stranger);
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values('operations-evidence',$1)", [
        path,
      ]),
    ).rejects.toThrow(/row-level security/);
    await as(worker);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('operations-evidence',$1)",
      [path],
    );
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
    await as(outsider);
    expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    await as(stranger);
    expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    await as(worker);
    await mutate(
      update(4, 'ready_for_review', {
        actual_items: [{ name: 'Stand', quantity: 2 }],
        recipient: 'Test recipient',
        evidence: [path],
      }),
    );
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values('operations-evidence',$1)", [
        `${org}/${campaign}/${task}/late.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/);
  });
  it('requires independent review, supports reopening and preserves immutable completed tasks', async () => {
    await expect(
      mutate({
        action: 'approve',
        task_id: task,
        expected_version: 5,
        note: 'I approve my own task.',
      }),
    ).rejects.toThrow(/Independent/);
    await as(admin);
    await mutate({
      action: 'reopen',
      task_id: task,
      expected_version: 5,
      note: 'Please explain the missing stand.',
    });
    await as(worker);
    await mutate(
      update(6, 'ready_for_review', {
        actual_items: [{ name: 'Stand', quantity: 2 }],
        recipient: 'Test recipient',
        note: 'One stand was damaged; recipient accepted two.',
      }),
    );
    await as(admin);
    await mutate({
      action: 'approve',
      task_id: task,
      expected_version: 7,
      note: 'Short delivery reviewed and accepted.',
    });
    expect((await workspace()).tasks[0]?.status).toBe('completed');
    await expect(
      mutate({
        action: 'assign',
        task_id: task,
        expected_version: 8,
        assigned_to: stranger,
        due_at: create.due_at,
      }),
    ).rejects.toThrow(/not permitted/);
    await as(worker);
    await expect(mutate(update(8, 'in_progress'))).rejects.toThrow(/transition/);
  });
  it('revokes a previous worker after reassignment, including private evidence access', async () => {
    await as(admin);
    const extra = await mutate({ ...create, title: 'Collect promotional materials' });
    await as(worker);
    await mutate({ ...update(1, 'in_progress'), task_id: extra.id });
    const path = `${org}/${campaign}/${extra.id}/before-reassignment.jpg`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('operations-evidence',$1)",
      [path],
    );
    await mutate({ ...update(2, 'blocked'), task_id: extra.id });
    await as(admin);
    await mutate({
      action: 'assign',
      task_id: extra.id,
      expected_version: 3,
      assigned_to: stranger,
      due_at: create.due_at,
    });
    await as(worker);
    expect((await workspace()).tasks.some((row) => row.id === extra.id)).toBe(false);
    expect(
      (await db.query('select * from storage.objects where name=$1', [path])).rows,
    ).toEqual([]);
    await as(stranger);
    expect((await workspace()).tasks.some((row) => row.id === extra.id)).toBe(true);
  });
  it('prevents an administrator who is also the assignee from approving their own task', async () => {
    await as(admin);
    const own = await mutate({ ...create, assigned_to: admin });
    await mutate({ ...update(1, 'in_progress'), task_id: own.id });
    await mutate({
      ...update(2, 'ready_for_review', {
        actual_items: [{ name: 'Stand', quantity: 3 }],
        recipient: 'Test recipient',
      }),
      task_id: own.id,
    });
    await expect(
      mutate({
        action: 'approve',
        task_id: own.id,
        expected_version: 3,
        note: 'Approve my own completed delivery.',
      }),
    ).rejects.toThrow(/Independent/);
  });
  it('removes access after suspension, organization switch or organization deactivation', async () => {
    await db.exec(
      `reset role; update profiles set account_status='suspended' where id='${worker}'`,
    );
    await as(worker);
    await expect(workspace()).rejects.toThrow(/membership required/);
    expect((await db.query('select * from operations_tasks')).rows).toEqual([]);
    await db.exec(
      `reset role; update profiles set account_status='approved',organization_id='${otherOrg}' where id='${worker}'`,
    );
    await as(worker);
    expect((await workspace()).tasks).toEqual([]);
    await db.exec(`reset role; update organizations set status='inactive' where id='${org}'`);
    await as(admin);
    await expect(workspace()).rejects.toThrow(/membership required/);
    expect((await db.query('select * from operations_tasks')).rows).toEqual([]);
  });
});
