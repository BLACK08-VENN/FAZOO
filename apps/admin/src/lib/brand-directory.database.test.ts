import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const superAdmin = '20000000-0000-4000-8000-000000000002';
const ba = '20000000-0000-4000-8000-000000000003';
const suspended = '20000000-0000-4000-8000-000000000004';
async function as(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
async function counts() {
  return (
    await db.query<{ bas: number; stores: number; skus: number }>(`select
    (select count(*)::int from profiles where role='brand_ambassador') bas,
    (select count(*)::int from stores) stores,
    (select count(*)::int from skus) skus`)
  ).rows[0];
}
describe.sequential('Directory visibility with the approved authenticator pause', () => {
  beforeAll(async () => {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create table profiles(id uuid primary key,organization_id uuid,role text,account_status text);
      create table stores(id uuid primary key default gen_random_uuid(),organization_id uuid);
      create table skus(id uuid primary key default gen_random_uuid(),organization_id uuid);
      insert into profiles values
        ('${admin}','${orgA}','organization_admin','approved'),
        ('${superAdmin}','${orgA}','super_admin','approved'),
        ('${ba}','${orgA}','brand_ambassador','approved'),
        ('${suspended}','${orgA}','organization_admin','suspended'),
        (gen_random_uuid(),'${orgB}','brand_ambassador','approved');
      insert into stores(organization_id) values('${orgA}'),('${orgB}');
      insert into skus(organization_id) values('${orgA}'),('${orgB}');
      create function can_read_org(uuid) returns boolean language sql as $$select false$$;
      create function is_org_admin(uuid) returns boolean language sql as $$select false$$;
      create function is_super_admin() returns boolean language sql as $$select false$$;
      create function staff_session_verified() returns boolean language sql as $$select false$$;
      revoke all on function can_read_org(uuid),is_org_admin(uuid),is_super_admin(),staff_session_verified() from public,anon;
      grant execute on function can_read_org(uuid),is_org_admin(uuid),is_super_admin(),staff_session_verified() to authenticated;
      alter table profiles enable row level security;
      alter table stores enable row level security;
      alter table skus enable row level security;
      grant select on profiles,stores,skus to authenticated;
      create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or can_read_org(organization_id));
      create policy stores_read on stores for select to authenticated using(can_read_org(organization_id));
      create policy skus_read on skus for select to authenticated using(can_read_org(organization_id));
      create policy staff_mfa on stores as restrictive for all to authenticated using(staff_session_verified()) with check(staff_session_verified());
      create policy staff_mfa on skus as restrictive for all to authenticated using(staff_session_verified()) with check(staff_session_verified());`);
    await as(admin);
    expect(await counts()).toEqual({ bas: 0, stores: 0, skus: 0 });
    await db.exec('reset role');
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261104140530_restore_brand_directory_visibility.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  afterAll(() => db.close());
  it('restores approved administrator access only within their organization', async () => {
    await as(admin);
    expect(await counts()).toEqual({ bas: 1, stores: 1, skus: 1 });
    expect((await db.query('select is_org_admin($1) allowed', [orgB])).rows[0]).toEqual({
      allowed: false,
    });
  });
  it('retains platform administrator access across organizations', async () => {
    await as(superAdmin);
    expect(await counts()).toEqual({ bas: 2, stores: 2, skus: 2 });
  });
  it('does not grant merchandisers staff directory or administrator access', async () => {
    await as(ba);
    expect(await counts()).toEqual({ bas: 1, stores: 0, skus: 0 });
    expect((await db.query('select is_org_admin($1) allowed', [orgA])).rows[0]).toEqual({
      allowed: false,
    });
  });
  it('keeps suspended accounts and anonymous callers out of staff records', async () => {
    await as(suspended);
    expect(await counts()).toEqual({ bas: 0, stores: 0, skus: 0 });
    await db.exec('reset role;set role anon');
    await expect(db.query('select can_read_org($1)', [orgA])).rejects.toThrow(
      'permission denied',
    );
    await expect(db.query('select * from stores')).rejects.toThrow('permission denied');
  });
});
