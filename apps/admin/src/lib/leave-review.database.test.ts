import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const superAdmin = '20000000-0000-4000-8000-000000000002';
const supervisor = '20000000-0000-4000-8000-000000000003';
const ba = '20000000-0000-4000-8000-000000000004';
const leave = '30000000-0000-4000-8000-000000000001';
const otherLeave = '30000000-0000-4000-8000-000000000002';
async function as(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
async function review(id = leave, decision = 'approve', note: string | null = null) {
  return (
    await db.query<{ result: { status: string; decision: string } }>(
      'select public.admin_review_leave_request($1,$2,$3) result',
      [id, decision, note],
    )
  ).rows[0]!.result;
}
function legacyFunction(name: string) {
  const source = readFileSync(
    new URL(
      '../../../../supabase/migrations/20261002073755_require_staff_mfa.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const body = source.indexOf('AS $function$', start);
  const end = source.indexOf(';', source.indexOf('$function$', body + 'AS $function$'.length));
  return source.slice(start, end + 1);
}
describe.sequential('Leave review with the approved authenticator pause', () => {
  beforeAll(async () => {
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;
      create type leave_request_status as enum('pending','approved','denied','cancelled');
      create table profiles(id uuid primary key,organization_id uuid,role text,account_status text);
      create table leave_requests(id uuid primary key,organization_id uuid,status leave_request_status default 'pending',reviewed_by uuid,reviewed_at timestamptz,review_note text);
      create table audit_logs(actor_id uuid,action text,entity_id uuid,metadata jsonb);
      create function write_audit(p_action text,p_entity_type text,p_entity_id uuid,p_metadata jsonb) returns void language sql as $$insert into audit_logs values(auth.uid(),p_action,p_entity_id,p_metadata)$$;
      insert into profiles values('${admin}','${orgA}','organization_admin','approved'),('${superAdmin}','${orgA}','super_admin','approved'),('${supervisor}','${orgA}','supervisor','approved'),('${ba}','${orgA}','brand_ambassador','approved');
      insert into leave_requests(id,organization_id) values('${leave}','${orgA}'),('${otherLeave}','${orgB}');`);
    for (const name of ['assert_org_staff', 'assert_org_admin', 'admin_review_leave_request'])
      await db.exec(legacyFunction(name));
    await db.exec(`revoke all on function assert_org_staff(),assert_org_admin(),admin_review_leave_request(uuid,text,text) from public,anon;
      grant execute on function assert_org_staff(),assert_org_admin(),admin_review_leave_request(uuid,text,text) to authenticated;`);
    await as(admin);
    await expect(review()).rejects.toThrow('Staff MFA required');
    await db.exec('reset role');
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261105082426_restore_staff_action_authenticator_pause.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      "reset role;truncate audit_logs;update leave_requests set status='pending',reviewed_by=null,reviewed_at=null,review_note=null;update profiles set account_status='approved'",
    );
    await as(admin);
  });
  afterAll(() => db.close());
  it('approves under a regular signed-in session and records the actor and audit', async () => {
    expect(await review()).toMatchObject({ status: 'ok', decision: 'approved' });
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select status,reviewed_by,reviewed_at is not null recorded from leave_requests where id=$1',
          [leave],
        )
      ).rows[0],
    ).toEqual({ status: 'approved', reviewed_by: admin, recorded: true });
    expect(
      (await db.query('select actor_id,action,entity_id from audit_logs')).rows[0],
    ).toEqual({ actor_id: admin, action: 'leave_request.approved', entity_id: leave });
  });
  it('keeps denial reasons mandatory and records a valid denial', async () => {
    await expect(review(leave, 'deny')).rejects.toThrow('denial reason');
    expect(await review(leave, 'deny', 'Test review note')).toMatchObject({
      decision: 'denied',
    });
  });
  it('denies another organization and prevents repeated decisions', async () => {
    await expect(review(otherLeave)).rejects.toThrow('Cross-organization');
    await review();
    await expect(review()).rejects.toThrow('already been reviewed');
    await db.exec('reset role');
    expect((await db.query('select count(*)::int count from audit_logs')).rows[0]).toEqual({
      count: 1,
    });
  });
  it('retains platform administrator authority', async () => {
    await as(superAdmin);
    expect(await review(otherLeave)).toMatchObject({ decision: 'approved' });
  });
  it('rejects ambassadors, supervisors, suspended staff and anonymous callers', async () => {
    for (const actor of [ba, supervisor]) {
      await as(actor);
      await expect(review()).rejects.toThrow('Not permitted');
    }
    await db.exec(
      `reset role;update profiles set account_status='suspended' where id='${admin}'`,
    );
    await as(admin);
    await expect(review()).rejects.toThrow('not approved');
    await db.exec('reset role;set role anon');
    await expect(review()).rejects.toThrow('permission denied');
  });
  it('retains administrator-only and signed-in guard boundaries', async () => {
    expect((await db.query('select (assert_org_admin()).id id')).rows[0]).toEqual({
      id: admin,
    });
    await as(supervisor);
    await expect(db.query('select assert_org_admin()')).rejects.toThrow('Not permitted');
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await expect(db.query('select assert_org_staff()')).rejects.toThrow('Not signed in');
  });
});
