import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartnerWorkspace } from './partners';
import { lagosDate } from '@fazoo/config';

const db = new PGlite();
const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const ba = '20000000-0000-4000-8000-000000000001';
const otherBa = '20000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000003';
const outsider = '20000000-0000-4000-8000-000000000004';
const client = '20000000-0000-4000-8000-000000000005';
const month = lagosDate().slice(0, 7) + '-01';
const request = () => ({
  partner_id: null,
  company_name: 'Example Computers',
  city: 'Example Area',
  state: 'Lagos',
  branch: 'North',
  visit_date: lagosDate(),
  visit_method: 'Visit',
  reporting_month: month,
  sales_basis: 'Actual month',
  contact_person: 'Test contact',
  phone: '',
  email: '',
  employees: 4,
  sales: { Lenovo: 10, HP: 6, Dell: 7, Apple: 0, Asus: 9, Acer: 0, Other: 0 },
  other_brand_names: '',
  sells_mostly: 'PCs / laptops',
  products: {
    Printers: 'Yes',
    Projectors: 'No',
    Accessories: 'Yes',
    Networking: 'Unknown',
    'Phones & Tablets': 'No',
    'Servers & Storage': 'No',
    'Gaming and Gaming Accessories': 'Yes',
  },
  main_customers: 'SMB',
  notes: '',
  correction_of: null,
});
async function as(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function submit(payload: unknown = request(), id = crypto.randomUUID()) {
  const r = await db.query<{ result: { id: string; partner_id: string } }>(
    'select public.partner_submit_log($1,$2::jsonb) result',
    [id, JSON.stringify(payload)],
  );
  return r.rows[0]!.result;
}
async function workspace(page = 1, collector: string | null = null) {
  const r = await db.query<{ result: PartnerWorkspace }>(
    "select public.partner_workspace($1,'',$2,'',$3) result",
    [month, collector, page],
  );
  return r.rows[0]!.result;
}
describe.sequential('Lenovo partner reporting on PostgreSQL', () => {
  beforeAll(async () => {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create table organizations(id uuid primary key,slug text,status text);
      create table profiles(id uuid primary key,organization_id uuid references organizations(id),full_name text,role text,account_status text);
      create table operation_receipts(id uuid primary key default gen_random_uuid(),organization_id uuid,brand_ambassador_id uuid,client_request_id uuid unique,operation text,result jsonb,created_at timestamptz default now());
      create table audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid,actor_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz default now());
      create function public.staff_session_verified() returns boolean language sql stable as $$select coalesce(current_setting('test.staff_verified',true),'true')<>'false'$$;
      create function public.check_rate_limit(text,integer,integer) returns boolean language sql as $$select true$$;
      insert into organizations values('${org}','lenovo-nigeria','active'),('${otherOrg}','other-brand','active');
      insert into profiles values('${ba}','${org}','Test merchandiser','brand_ambassador','approved'),('${otherBa}','${org}','Second merchandiser','brand_ambassador','approved'),('${admin}','${org}','Test administrator','organization_admin','approved'),('${outsider}','${otherOrg}','Other administrator','organization_admin','approved'),('${client}','${org}','Test stakeholder','client','approved');`);
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261104101733_lenovo_partner_collection.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261104102120_lenovo_partner_access_context.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      `reset role;truncate partner_visit_logs,partner_outlets,partner_collection_settings,operation_receipts,audit_logs cascade;update profiles set account_status='approved';update organizations set status='active';select set_config('test.staff_verified','true',false);`,
    );
    await as(ba);
  });
  afterAll(() => db.close());
  it('derives collector and organization; calculates all seven brands and gaming', async () => {
    const result = await submit({
      ...request(),
      organization_id: otherOrg,
      collected_by: outsider,
      total_pcs: 999,
    });
    const w = await workspace();
    expect(w.logs_count).toBe(1);
    expect(w.total_pcs).toBe(32);
    expect(w.lenovo_units).toBe(10);
    expect(w.logs[0]?.priority).toBe('Medium');
    expect(w.logs[0]?.collected_by).toBe(ba);
    expect(w.products.find((r) => r.label === 'Gaming and Gaming Accessories')?.companies).toBe(
      1,
    );
    expect(result.id).toBeTruthy();
  });
  it('retries exactly once and rejects changed requests or stolen receipts', async () => {
    const id = crypto.randomUUID();
    const first = await submit(request(), id);
    expect(await submit(request(), id)).toEqual(first);
    expect((await workspace()).logs_count).toBe(1);
    await expect(submit({ ...request(), notes: 'Changed' }, id)).rejects.toThrow(
      'different answers',
    );
    await as(otherBa);
    await expect(submit(request(), id)).rejects.toThrow('already in use');
  });
  it('keeps repeat visits but counts one latest record per outlet/month across collectors', async () => {
    const first = await submit();
    await as(otherBa);
    await submit({
      ...request(),
      partner_id: first.partner_id,
      sales: { ...request().sales, Lenovo: 20 },
    });
    await as(admin);
    const w = await workspace();
    expect(w.logs_count).toBe(2);
    expect(w.outlets_count).toBe(1);
    expect(w.total_pcs).toBe(42);
    expect(w.lenovo_units).toBe(20);
    expect((await workspace(1, ba)).total_pcs).toBe(0);
    await as(ba);
    expect((await workspace()).logs_count).toBe(1);
    expect((await workspace()).current_count).toBe(0);
  });
  it('normalizes duplicate company identities while keeping separate branches', async () => {
    const first = await submit();
    const repeat = await submit({
      ...request(),
      company_name: '  EXAMPLE  Computers ',
      city: ' EXAMPLE  Area ',
    });
    expect(repeat.partner_id).toBe(first.partner_id);
    const branch = await submit({ ...request(), branch: 'South' });
    expect(branch.partner_id).not.toBe(first.partner_id);
    expect((await workspace()).outlets_count).toBe(2);
  });
  it('preserves unknown quantities and excludes incomplete records from comparable totals', async () => {
    await submit({ ...request(), sales: { ...request().sales, HP: null } });
    let w = await workspace();
    expect(w.total_pcs).toBe(0);
    expect(w.unknown_count).toBe(1);
    expect(w.logs[0]?.total_pcs).toBeNull();
    expect(w.logs[0]?.priority).toBe('Unknown');
    await submit({
      ...request(),
      sales: Object.fromEntries(Object.keys(request().sales).map((b) => [b, 0])),
    });
    w = await workspace();
    expect(w.unknown_count).toBe(0);
    expect(w.complete_count).toBe(1);
    expect(w.logs[0]?.priority).toBe('Low');
  });
  it('computes collective share from matching unit totals', async () => {
    await submit({
      ...request(),
      sales: { Lenovo: 10, HP: 0, Dell: 0, Apple: 0, Asus: 0, Acer: 0, Other: 0 },
    });
    await submit({
      ...request(),
      branch: 'South',
      sales: { Lenovo: 0, HP: 90, Dell: 0, Apple: 0, Asus: 0, Acer: 0, Other: 0 },
    });
    const w = await workspace();
    expect(w.lenovo_units / w.total_pcs).toBe(0.1);
  });
  it('denies direct writes, anonymous access, unapproved users and other organizations', async () => {
    await expect(
      db.exec("insert into partner_collection_settings values('" + org + "',100,30)"),
    ).rejects.toThrow('permission denied');
    await as(outsider);
    await expect(workspace()).rejects.toThrow('Lenovo Nigeria only');
    expect((await db.query('select * from partner_visit_logs')).rows).toHaveLength(0);
    await db.exec('reset role;set role anon');
    await expect(submit()).rejects.toThrow('permission denied');
    await db.exec(`reset role;update profiles set account_status='suspended' where id='${ba}'`);
    await as(ba);
    await expect(submit()).rejects.toThrow('Approved Lenovo');
  });
  it('restricts BA history to their own rows and lets administrators see all while excluding client accounts', async () => {
    await submit();
    await as(otherBa);
    await submit({ ...request(), branch: 'South' });
    expect((await db.query('select * from partner_visit_logs')).rows).toHaveLength(1);
    await as(admin);
    expect((await workspace()).logs_count).toBe(2);
    await as(client);
    await expect(workspace()).rejects.toThrow('Approved Lenovo');
    await expect(submit()).rejects.toThrow('Approved Lenovo');
  });
  it('honors paused authenticator access while enforcing active organization status', async () => {
    await as(admin);
    await db.exec("select set_config('test.staff_verified','false',false)");
    expect((await workspace()).logs_count).toBe(0);
    await db.exec(`reset role;update organizations set status='suspended' where id='${org}'`);
    await as(ba);
    await expect(submit()).rejects.toThrow('Lenovo Nigeria only');
  });
  it('validates negative, fractional, absent and invalid category inputs at the database boundary', async () => {
    await expect(
      submit({ ...request(), sales: { ...request().sales, HP: -1 } }),
    ).rejects.toThrow('nonnegative whole');
    await expect(submit({ ...request(), employees: 2.5 })).rejects.toThrow('nonnegative whole');
    await expect(
      submit({ ...request(), sales: { ...request().sales, Other: 3 } }),
    ).rejects.toThrow('Name the other brands');
    await expect(submit({ ...request(), state: 'Invalid' })).rejects.toThrow('Nigerian state');
    await expect(submit({ ...request(), products: {} })).rejects.toThrow('all product');
    await expect(submit({ ...request(), reporting_month: '2099-01-01' })).rejects.toThrow(
      'future dates',
    );
    await expect(submit({ ...request(), visit_date: null })).rejects.toThrow('Dates cannot');
  });
  it('records corrections with ownership checks and an immutable original', async () => {
    const first = await submit();
    await submit({
      ...request(),
      partner_id: first.partner_id,
      correction_of: first.id,
      notes: 'Corrected',
    });
    expect((await workspace()).logs_count).toBe(2);
    await as(otherBa);
    await expect(
      submit({ ...request(), partner_id: first.partner_id, correction_of: first.id }),
    ).rejects.toThrow('your own log');
  });
  it('restricts threshold changes, audits them, and applies boundary values', async () => {
    const sql = 'select public.partner_set_thresholds($1,100,30) result';
    await expect(db.query(sql, [crypto.randomUUID()])).rejects.toThrow('Administrator');
    await as(admin);
    const id = crypto.randomUUID();
    await db.query(sql, [id]);
    await db.query(sql, [id]);
    await as(ba);
    for (const n of [29, 30, 99, 100])
      await submit({
        ...request(),
        branch: String(n),
        sales: { Lenovo: n, HP: 0, Dell: 0, Apple: 0, Asus: 0, Acer: 0, Other: 0 },
      });
    const w = await workspace();
    expect(w.logs.map((l) => l.priority)).toEqual(['High', 'Medium', 'Medium', 'Low']);
    await as(admin);
    await expect(
      db.query('select public.partner_set_thresholds($1,20,30)', [crypto.randomUUID()]),
    ).rejects.toThrow('exceed');
  });
  it('paginates history without truncating collective metrics; export is one snapshot', async () => {
    for (let i = 0; i < 31; i++) await submit({ ...request(), branch: String(i) });
    const first = await workspace();
    const second = await workspace(2);
    expect(first.logs).toHaveLength(30);
    expect(second.logs).toHaveLength(1);
    expect(first.total_pcs).toBe(31 * 32);
    expect((await workspace(0)).logs).toHaveLength(31);
  });
});
