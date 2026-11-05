import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NotificationInbox } from '@fazoo/types';
const db = new PGlite();
const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const ba = '20000000-0000-4000-8000-000000000002';
const client = '20000000-0000-4000-8000-000000000003';
const supervisor = '20000000-0000-4000-8000-000000000004';
const outsider = '20000000-0000-4000-8000-000000000005';
const superAdmin = '20000000-0000-4000-8000-000000000006';
const campaign = '30000000-0000-4000-8000-000000000001';
async function as(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function activity(sql: string, actor = ba) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${actor}',false);${sql}`,
  );
}
async function inbox(before?: { created_at: string; id: string }) {
  return (
    await db.query<{ result: NotificationInbox }>('select notification_inbox($1,$2) result', [
      before?.created_at ?? null,
      before?.id ?? null,
    ])
  ).rows[0]!.result;
}
async function request() {
  await activity(
    `insert into leave_requests(organization_id,brand_ambassador_id,status) values('${org}','${ba}','pending')`,
  );
}
describe.sequential('Private role-aware activity notifications', () => {
  beforeAll(async () => {
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table organizations(id uuid primary key,name text,status text);
    create table profiles(id uuid primary key,organization_id uuid,role text,account_status text,current_membership_id uuid);
    create table organization_memberships(id uuid primary key default gen_random_uuid(),user_id uuid,organization_id uuid,role text,account_status text);
    create table operation_receipts(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,client_request_id uuid unique,operation text,result jsonb);
    create table audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid,actor_id uuid,action text,entity_type text,metadata jsonb);
    create function check_rate_limit(text,int,int) returns boolean language sql as $$select true$$;
    create function supervisor_can_see_campaign(uuid,uuid) returns boolean language sql as $$select $1='${supervisor}'::uuid and $2='${campaign}'::uuid$$;
    create table leave_requests(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,status text);
    create table brand_ambassador_assignments(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,campaign_id uuid,status text,updated_at timestamptz);
    create table partner_visit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid,reporting_month date);
    create table daily_logs(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,campaign_id uuid,status text,flagged boolean default false);
    create table booklist_jobs(id uuid primary key default gen_random_uuid(),organization_id uuid,owner_ba_id uuid,stage text);
    create table maintenance_jobs(id uuid primary key default gen_random_uuid(),organization_id uuid,reported_by uuid,assigned_to uuid,status text,version int default 1,updated_at timestamptz);
    create table campaigns(id uuid primary key default gen_random_uuid(),organization_id uuid,status text);
    insert into organizations values('${org}','Example Retail','active'),('${otherOrg}','Other Brand','active');
    insert into profiles values('${admin}','${org}','organization_admin','approved',null),('${ba}','${org}','brand_ambassador','approved',null),('${client}','${org}','client','approved',null),('${supervisor}','${org}','supervisor','approved',null),('${outsider}','${otherOrg}','organization_admin','approved',null),('${superAdmin}','${otherOrg}','super_admin','approved',null);
    insert into campaigns values('${campaign}','${org}','active');`);
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261105085450_role_notifications.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261105090532_notification_reopened_logs.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      `reset role;truncate user_notifications,operation_receipts,audit_logs,leave_requests,brand_ambassador_assignments,partner_visit_logs,daily_logs,booklist_jobs,maintenance_jobs,organization_memberships;update profiles set account_status='approved';update profiles set role='organization_admin' where id='20000000-0000-4000-8000-000000000001';update organizations set status='active';select set_config('request.jwt.claim.sub','',false);`,
    );
  });
  afterAll(() => db.close());
  it('routes leave requests only to responsible administrators, never other brands or clients', async () => {
    await request();
    for (const user of [admin, superAdmin]) {
      await as(user);
      expect((await inbox()).unread_count).toBe(1);
    }
    for (const user of [ba, client, supervisor, outsider]) {
      await as(user);
      expect((await inbox()).items).toHaveLength(0);
    }
  });
  it('notifies the leave owner of a decision without exposing the leave reason', async () => {
    await request();
    await activity("update leave_requests set status='approved'", admin);
    await as(ba);
    const w = await inbox();
    expect(w.items[0]?.title).toBe('Leave request approved');
    expect(w.items[0]?.body).toBe('Your leave request has been approved.');
    await as(client);
    expect((await inbox()).items).toHaveLength(0);
  });
  it('targets assignment changes and ignores timestamp-only updates', async () => {
    await activity(
      `insert into brand_ambassador_assignments(organization_id,brand_ambassador_id,campaign_id,status) values('${org}','${ba}','${campaign}','active')`,
      admin,
    );
    await activity('update brand_ambassador_assignments set updated_at=now()', admin);
    await as(ba);
    expect((await inbox()).items).toHaveLength(1);
  });
  it('routes field work to scoped supervisors and partner submissions only to administrators', async () => {
    await activity(
      `insert into daily_logs(organization_id,campaign_id,status) values('${org}','${campaign}','open');update daily_logs set status='completed'`,
    );
    await as(supervisor);
    expect((await inbox()).items).toHaveLength(1);
    await activity(
      `insert into partner_visit_logs(organization_id,reporting_month) values('${org}','2026-11-01')`,
    );
    await as(supervisor);
    expect((await inbox()).items).toHaveLength(1);
    await as(admin);
    expect((await inbox()).items).toHaveLength(2);
    await as(client);
    expect((await inbox()).items).toHaveLength(0);
  });
  it('notifies clients about campaign status and BAs about booklist progress', async () => {
    await activity(`update campaigns set status='completed' where id='${campaign}'`, admin);
    await as(client);
    expect((await inbox()).items[0]?.kind).toBe('campaign.updated');
    await activity(
      `insert into booklist_jobs(organization_id,owner_ba_id,stage) values('${org}','${ba}','formatted')`,
      admin,
    );
    await as(ba);
    expect((await inbox()).items[0]?.kind).toBe('booklist.updated');
  });
  it('routes maintenance assignment and review without duplicate version-only alerts', async () => {
    await activity(
      `insert into maintenance_jobs(organization_id,reported_by,status) values('${org}','${client}','requested')`,
      client,
    );
    await activity(
      `update maintenance_jobs set assigned_to='${ba}',status='assigned';update maintenance_jobs set version=version+1`,
      admin,
    );
    await as(ba);
    expect((await inbox()).items).toHaveLength(1);
    await activity("update maintenance_jobs set status='ready_for_review'", ba);
    await as(admin);
    expect((await inbox()).items.some((n) => n.title === 'Work order awaiting approval')).toBe(
      true,
    );
    await as(outsider);
    expect((await inbox()).items).toHaveLength(0);
  });
  it('enforces ownership, immutable content, read receipts and exact retries', async () => {
    await request();
    await as(admin);
    const n = (await inbox()).items[0]!;
    const key = crypto.randomUUID();
    const sql = 'select notification_mark_read($1,$2) result';
    const first = (await db.query(sql, [key, [n.id]])).rows[0];
    expect((await db.query(sql, [key, [n.id]])).rows[0]).toEqual(first);
    expect((await inbox()).unread_count).toBe(0);
    await expect(db.exec("update user_notifications set title='Forged'")).rejects.toThrow(
      'permission denied',
    );
    await expect(
      db.exec(
        `select private.notify_user('${ba}','${org}','x','x','x','x','/workspace','/brand',null)`,
      ),
    ).rejects.toThrow('permission denied');
    await as(ba);
    await expect(
      db.query('select notification_open($1,$2)', [n.id, crypto.randomUUID()]),
    ).rejects.toThrow('no longer available');
    await expect(db.query(sql, [key, [n.id]])).rejects.toThrow('already in use');
    expect((await db.query('select * from user_notifications')).rows).toHaveLength(0);
  });
  it('supports mark-all and stable paginated history without re-notifying reads', async () => {
    for (let i = 0; i < 32; i++) await request();
    await as(admin);
    const first = await inbox();
    expect(first.items).toHaveLength(30);
    expect(first.has_more).toBe(true);
    const second = await inbox(first.items.at(-1));
    expect(second.items).toHaveLength(2);
    expect(second.has_more).toBe(false);
    await db.query('select notification_mark_read($1)', [crypto.randomUUID()]);
    expect((await inbox()).unread_count).toBe(0);
    expect((await inbox()).items).toHaveLength(30);
  });
  it('revokes notification visibility when account, role, brand or membership access changes', async () => {
    await request();
    await activity(
      `update profiles set account_status='suspended' where id='${admin}'`,
      superAdmin,
    );
    await as(admin);
    expect((await inbox()).items).toHaveLength(0);
    await db.exec('reset role');
    await db.exec(
      `update profiles set account_status='approved',role='client' where id='${admin}'`,
    );
    await as(admin);
    expect((await inbox()).items).toHaveLength(0);
    await db.exec('reset role');
    await db.exec(`update organizations set status='suspended' where id='${org}'`);
    await as(superAdmin);
    expect((await inbox()).items).toHaveLength(0);
  });
  it('removes alerts immediately after an assigned staff membership is revoked', async () => {
    await activity(
      `insert into organization_memberships(user_id,organization_id,role,account_status) values('${admin}','${otherOrg}','organization_admin','approved')`,
      superAdmin,
    );
    await activity(
      `insert into leave_requests(organization_id,brand_ambassador_id,status) values('${otherOrg}','${outsider}','pending')`,
      outsider,
    );
    await as(admin);
    expect((await inbox()).items.some((n) => n.kind === 'leave.request')).toBe(true);
    await activity(
      `update organization_memberships set account_status='suspended' where user_id='${admin}'`,
      superAdmin,
    );
    await as(admin);
    expect((await inbox()).items).toHaveLength(0);
  });
  it('delivers one approval alert when profile and membership approval are synchronized', async () => {
    await activity(
      `update profiles set account_status='pending' where id='${ba}';insert into organization_memberships(user_id,organization_id,role,account_status) values('${ba}','${org}','brand_ambassador','pending')`,
      superAdmin,
    );
    await as(ba);
    expect((await inbox()).items).toHaveLength(0);
    await activity(
      `begin;update organization_memberships set account_status='approved' where user_id='${ba}';update profiles set account_status='approved' where id='${ba}';commit`,
      superAdmin,
    );
    await as(ba);
    const notices = (await inbox()).items;
    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe('account.approved');
  });
  it('alerts the owner when a completed field log is reopened', async () => {
    await activity(
      `insert into daily_logs(organization_id,brand_ambassador_id,campaign_id,status) values('${org}','${ba}','${campaign}','completed')`,
    );
    await activity(`update daily_logs set status='open'`, admin);
    await as(ba);
    expect((await inbox()).items[0]?.kind).toBe('field.reopened');
  });
  it('does not backfill history or deliver events rolled back by the business operation', async () => {
    await as(admin);
    expect((await inbox()).items).toHaveLength(0);
    await db.exec('reset role;begin');
    await request();
    await db.exec('rollback');
    await as(admin);
    expect((await inbox()).items).toHaveLength(0);
    await db.exec('reset role;set role anon');
    await expect(inbox()).rejects.toThrow('permission denied');
  });
});
