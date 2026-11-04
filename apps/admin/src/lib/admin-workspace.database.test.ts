import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminBrandHub } from './admin-workspace';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001',
  orgB = '10000000-0000-4000-8000-000000000002',
  orgC = '10000000-0000-4000-8000-000000000003';
const superAdmin = '20000000-0000-4000-8000-000000000001',
  admin = '20000000-0000-4000-8000-000000000002',
  assigned = '20000000-0000-4000-8000-000000000003',
  ba = '20000000-0000-4000-8000-000000000004';
const membership = '30000000-0000-4000-8000-000000000001';
async function as(uid: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`,
  );
}
async function hub() {
  return (await db.query<{ result: AdminBrandHub }>('select public.admin_brand_hub() result'))
    .rows[0]!.result;
}
async function open(org = orgB, id = crypto.randomUUID()) {
  return (
    await db.query<{ result: { organization_id: string } }>(
      'select public.admin_open_brand($1,$2) result',
      [org, id],
    )
  ).rows[0]!.result;
}

describe.sequential('Brand-neutral hub and guarded workspace selection', () => {
  beforeAll(async () => {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table organizations(id uuid primary key,name text,slug text,logo_url text,kind text,status text);
      create table profiles(id uuid primary key,organization_id uuid,full_name text,role text,account_status text,current_membership_id uuid);
      create table organization_memberships(id uuid primary key,user_id uuid,organization_id uuid,role text,account_status text);
      create table campaigns(id uuid primary key default gen_random_uuid(),organization_id uuid,status text);
      create table operation_receipts(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,client_request_id uuid unique,operation text,result jsonb);
      create table audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid,actor_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
      create function check_rate_limit(text,int,int) returns boolean language sql as $$select true$$;
      insert into organizations values('${orgA}','Example Schools','school-brand',null,'schools','active'),('${orgB}','Example Retail','retail-brand',null,'retail','active'),('${orgC}','Paused Brand','paused-brand',null,'retail','suspended');
      insert into profiles values('${superAdmin}','${orgA}','Test super administrator','super_admin','approved',null),('${admin}','${orgA}','Test administrator','organization_admin','approved',null),('${assigned}','${orgA}','Assigned administrator','organization_admin','approved',null),('${ba}','${orgA}','Test ambassador','brand_ambassador','approved',null);
      insert into organization_memberships values('${membership}','${assigned}','${orgB}','supervisor','approved');
      insert into campaigns(organization_id,status) values('${orgA}','active'),('${orgB}','active'),('${orgB}','draft'),('${orgC}','active');
    `);
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261104125736_admin_brand_hub.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      `reset role;truncate operation_receipts,audit_logs;update profiles set organization_id='${orgA}',account_status='approved',current_membership_id=null;update profiles set role='organization_admin' where id='${assigned}';update organization_memberships set account_status='approved';`,
    );
    await as(superAdmin);
  });
  afterAll(() => db.close());
  it('shows all active brands to a super administrator regardless of current brand kind', async () => {
    const r = await hub();
    expect(r.active_brands).toBe(2);
    expect(r.active_campaigns).toBe(2);
    expect(r.brands.map((b) => b.kind).sort()).toEqual(['retail', 'schools']);
    expect(r.brands.some((b) => b.id === orgC)).toBe(false);
  });
  it('limits other staff to their current and explicitly approved staff memberships', async () => {
    await as(admin);
    expect((await hub()).brands.map((b) => b.id)).toEqual([orgA]);
    await as(assigned);
    expect((await hub()).active_brands).toBe(2);
  });
  it('switches a super administrator, audits the selection and retries safely', async () => {
    const id = crypto.randomUUID();
    expect((await open(orgB, id)).organization_id).toBe(orgB);
    expect((await open(orgB, id)).organization_id).toBe(orgB);
    await db.exec('reset role');
    expect(
      (await db.query('select organization_id,role from profiles where id=$1', [superAdmin]))
        .rows[0],
    ).toEqual({ organization_id: orgB, role: 'super_admin' });
    expect((await db.query('select count(*)::int n from audit_logs')).rows[0]).toEqual({
      n: 1,
    });
  });
  it('denies opening an unassigned or suspended brand', async () => {
    await as(admin);
    await expect(open()).rejects.toThrow('not assigned');
    await as(superAdmin);
    await expect(open(orgC)).rejects.toThrow('not active');
  });
  it('uses the stored membership role and rejects revoked membership sessions', async () => {
    await as(assigned);
    await open();
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select organization_id,role,current_membership_id from profiles where id=$1',
          [assigned],
        )
      ).rows[0],
    ).toEqual({ organization_id: orgB, role: 'supervisor', current_membership_id: membership });
    await db.exec(
      `update organization_memberships set account_status='rejected' where id='${membership}'`,
    );
    await as(assigned);
    await expect(hub()).rejects.toThrow('no longer active');
  });
  it('rejects cross-user receipt reuse and stale retries after another brand switch', async () => {
    const id = crypto.randomUUID();
    await open(orgB, id);
    await open(orgA);
    await expect(open(orgB, id)).rejects.toThrow('selection changed');
    await as(assigned);
    await expect(open(orgB, id)).rejects.toThrow('already in use');
  });
  it('denies BA, anonymous and unapproved staff callers', async () => {
    await as(ba);
    await expect(hub()).rejects.toThrow('Approved staff');
    await expect(open()).rejects.toThrow('Approved staff');
    await db.exec('reset role;set role anon');
    await expect(hub()).rejects.toThrow('permission denied');
    await db.exec(
      `reset role;update profiles set account_status='suspended' where id='${admin}'`,
    );
    await as(admin);
    await expect(hub()).rejects.toThrow('Approved staff');
  });
});
