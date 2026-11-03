import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const client = '20000000-0000-4000-8000-000000000001';
const otherClient = '20000000-0000-4000-8000-000000000002';
const ba = '20000000-0000-4000-8000-000000000003';
const admin = '20000000-0000-4000-8000-000000000004';
const outsider = '20000000-0000-4000-8000-000000000005';
const orgA = '40000000-0000-4000-8000-000000000001';
const orgB = '40000000-0000-4000-8000-000000000002';

const db = new PGlite();

async function as(uid: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`,
  );
}

async function requestCampaign(
  requestId = crypto.randomUUID(),
  name = 'Back to school activation',
) {
  const result = await db.query<{ result: { campaign_id: string; campaign_status: string } }>(
    'select public.client_create_campaign($1,$2,$3,$4,$5) as result',
    [requestId, name, 'Fictional stores across Lagos', '2026-11-10', '2026-11-30'],
  );
  return { result: result.rows[0]!.result, requestId };
}

async function expectReject(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
  await db.exec('rollback');
}

async function review(
  campaignId: string,
  decision: 'approve' | 'reject',
  requestId = crypto.randomUUID(),
) {
  const result = await db.query<{ result: { campaign_status: string } }>(
    'select public.admin_review_campaign($1,$2,$3,$4) as result',
    [requestId, campaignId, decision, 'Reviewed in the test suite'],
  );
  return { result: result.rows[0]!.result, requestId };
}

describe.sequential('Client campaign approval migration (PGlite)', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon;

      create type public.campaign_status as enum ('draft','active','completed','cancelled');

      create table organizations(id uuid primary key, status text not null);
      create table profiles(
        id uuid primary key,
        organization_id uuid references organizations(id),
        full_name text,
        role text,
        account_status text
      );
      alter table profiles enable row level security;
      create table campaigns(
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id),
        name text not null,
        description text,
        start_date date not null,
        end_date date,
        status public.campaign_status not null default 'draft',
        access_code text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table operation_receipts(
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null,
        brand_ambassador_id uuid not null,
        client_request_id uuid not null unique,
        operation text not null,
        result jsonb,
        created_at timestamptz not null default now()
      );
      create table audit_logs(
        id uuid primary key default gen_random_uuid(),
        organization_id uuid,
        actor_id uuid,
        action text not null,
        entity_type text not null,
        entity_id uuid,
        metadata jsonb,
        created_at timestamptz not null default now()
      );

      create function public.check_rate_limit(text,int,int) returns boolean
        language sql as $$ select true $$;
      create function public.is_client() returns boolean
        language sql stable security definer set search_path='' as
        $$ select exists(select 1 from public.profiles where id=auth.uid() and role='client' and account_status='approved') $$;
      create function public.can_read_org(uuid) returns boolean
        language sql stable security definer set search_path='' as
        $$ select exists(select 1 from public.profiles where id=auth.uid() and account_status='approved') $$;

      grant usage on schema public to authenticated, anon;
      grant select on public.profiles to authenticated;
      grant select on public.organizations to authenticated;
      grant select on public.campaigns to authenticated;

      insert into organizations values('${orgA}','active'),('${orgB}','active');
      insert into profiles values
        ('${client}','${orgA}','Client Requester','client','approved'),
        ('${otherClient}','${orgA}','Another Client','client','approved'),
        ('${ba}','${orgA}','Field Ambassador','brand_ambassador','approved'),
        ('${admin}','${orgA}','Organization Admin','organization_admin','approved'),
        ('${outsider}','${orgB}','Other Org Admin','organization_admin','approved');
    `);

    const migration = fileURLToPath(
      new URL(
        '../../../../../supabase/migrations/20261103120000_client_campaign_approval.sql',
        import.meta.url,
      ),
    );
    await db.exec(readFileSync(migration, 'utf8'));
    await db.exec('commit;');
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it('lets a client request a campaign that is waiting for approval', async () => {
    await as(client);
    const { result } = await requestCampaign();
    expect(result.campaign_status).toBe('pending_approval');

    const rows = await db.query<{
      organization_id: string;
      status: string;
      requested_by: string;
    }>('select organization_id,status,requested_by from public.campaigns where id=$1', [
      result.campaign_id,
    ]);
    expect(rows.rows[0]).toEqual({
      organization_id: orgA,
      status: 'pending_approval',
      requested_by: client,
    });
  });

  it('replays the same client request without creating another campaign', async () => {
    await as(client);
    const requestId = crypto.randomUUID();
    const first = await requestCampaign(requestId, 'Repeat-safe activation');
    const second = await requestCampaign(requestId, 'Repeat-safe activation');
    expect(second.result.campaign_id).toBe(first.result.campaign_id);

    const rows = await db.query<{ count: number }>(
      "select count(*)::int as count from public.campaigns where name='Repeat-safe activation'",
    );
    expect(rows.rows[0]!.count).toBe(1);
  });

  it('rejects campaign requests from non-client roles', async () => {
    await as(ba);
    await expectReject(requestCampaign(), /Only approved brand clients/);
  });

  it('lets an administrator approve a pending campaign', async () => {
    await as(client);
    const { result } = await requestCampaign();
    await as(admin);
    const decision = await review(result.campaign_id, 'approve');
    expect(decision.result.campaign_status).toBe('active');

    const rows = await db.query<{ reviewed_by: string; review_note: string }>(
      'select reviewed_by,review_note from public.campaigns where id=$1',
      [result.campaign_id],
    );
    expect(rows.rows[0]).toEqual({
      reviewed_by: admin,
      review_note: 'Reviewed in the test suite',
    });
  });

  it('rejects cross-organization approvals and repeat reviews', async () => {
    await as(client);
    const { result } = await requestCampaign();
    await as(outsider);
    await expectReject(
      review(result.campaign_id, 'approve'),
      /Cross-organization access denied/,
    );

    await as(admin);
    await review(result.campaign_id, 'approve');
    await expectReject(review(result.campaign_id, 'reject'), /not awaiting approval/);
  });

  it('keeps client profile reads scoped to the client themselves', async () => {
    await as(client);
    const visible = await db.query<{ id: string }>('select id from public.profiles');
    expect(visible.rows).toEqual([{ id: client }]);
  });
});
