import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const adminA = '20000000-0000-4000-8000-000000000001';
const adminB = '20000000-0000-4000-8000-000000000002';
const ba = '20000000-0000-4000-8000-000000000003';
const schoolA = '30000000-0000-4000-8000-000000000001';
const schoolB = '30000000-0000-4000-8000-000000000002';
const historical = '40000000-0000-4000-8000-000000000001';
async function as(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function queue() {
  return (
    await db.query<{
      result: {
        queue: Array<Record<string, unknown>>;
        counts: {
          awaiting_preparation: number;
          missing_original: number;
          formatted_ready: number;
        };
      };
    }>('select public.admin_document_preparation_queue() result')
  ).rows[0]!.result;
}

describe.sequential('Manual document preparation after recognition removal', () => {
  beforeAll(async () => {
    await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create type ocr_status as enum('not_required','queued','processing','succeeded','failed','manual_required');
      create table profiles(id uuid primary key,organization_id uuid,role text,account_status text,full_name text,agency text);
      create table veda_schools(id uuid primary key,name text,region text);
      create table booklist_jobs(id uuid primary key default gen_random_uuid(),organization_id uuid,school_id uuid,stage text,owner_ba_id uuid,document_received_at timestamptz default now(),raw_document_id uuid,ocr_status ocr_status default 'not_required');
      create table booklist_documents(id uuid primary key default gen_random_uuid(),organization_id uuid,job_id uuid,kind text,storage_path text,storage_bucket text default 'booklist-documents',mime_type text,file_size_bytes bigint,page_count int,source_format text,is_current boolean default true,ocr_status ocr_status default 'not_required');
      create function public.assert_org_staff() returns public.profiles language plpgsql stable security definer set search_path='' as $$declare p public.profiles;begin select * into p from public.profiles where id=auth.uid();if p.id is null or p.account_status<>'approved' or p.role not in ('organization_admin','super_admin','supervisor') then raise exception 'Approved staff access required' using errcode='42501';end if;return p;end$$;
      create function public.admin_booklist_queue(ocr_status,int) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function public.admin_record_ocr_result(uuid,ocr_status,text,numeric,text,text,text,bigint,integer,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
      insert into profiles values('${adminA}','${orgA}','organization_admin','approved','Test admin A',null),('${adminB}','${orgB}','organization_admin','approved','Test admin B',null),('${ba}','${orgA}','brand_ambassador','approved','Test BA','ael');
      insert into veda_schools values('${schoolA}','Example School A','Example area'),('${schoolB}','Example School B','Other area');
      insert into booklist_documents(id,organization_id,kind,storage_path,ocr_status) values('${historical}','${orgA}','ocr_draft','historical/saved-draft.docx','succeeded');
    `);
    await db.exec(
      readFileSync(
        new URL(
          '../../../../supabase/migrations/20261104125732_remove_document_recognition.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }, 30000);
  afterAll(() => db.close());
  it('removes old executable processing and queue functions', async () => {
    const r = await db.query<{ recorder: string | null; queue: string | null }>(
      "select to_regprocedure('public.admin_record_ocr_result(uuid,ocr_status,text,numeric,text,text,text,bigint,integer,uuid)')::text recorder,to_regprocedure('public.admin_booklist_queue(ocr_status,integer)')::text queue",
    );
    expect(r.rows[0]).toEqual({ recorder: null, queue: null });
  });
  it('preserves historical draft records and their download paths', async () => {
    const r = await db.query(
      'select storage_path,ocr_status from booklist_documents where id=$1',
      [historical],
    );
    expect(r.rows).toEqual([
      { storage_path: 'historical/saved-draft.docx', ocr_status: 'succeeded' },
    ]);
    await db.exec(`update booklist_documents set is_current=false where id='${historical}'`);
    expect(
      (await db.query('select storage_path from booklist_documents where id=$1', [historical]))
        .rows,
    ).toHaveLength(1);
  });
  it('prevents legacy upload code from queuing recognition and still accepts prepared documents', async () => {
    await db.exec(`insert into booklist_jobs(organization_id,school_id,stage,owner_ba_id,ocr_status) values('${orgA}','${schoolA}','awaiting_conversion','${ba}','queued');
      insert into booklist_documents(organization_id,kind,storage_path,ocr_status) values('${orgA}','raw_upload','example/original.pdf','queued'),('${orgA}','formatted','example/prepared.docx','not_required');`);
    expect(
      (
        await db.query(
          "select count(*)::int n from booklist_jobs where ocr_status in ('queued','processing')",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await db.query(
          "select count(*)::int n from booklist_documents where ocr_status in ('queued','processing')",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    await expect(
      db.exec(
        `insert into booklist_documents(kind,storage_path) values('ocr_draft','new-draft.docx')`,
      ),
    ).rejects.toThrow('no longer supported');
  });
  it('includes every pending preparation stage without processing-state filters', async () => {
    await db.exec(
      `insert into booklist_jobs(organization_id,school_id,stage) values('${orgA}','${schoolA}','document_received'),('${orgA}','${schoolA}','converting'),('${orgA}','${schoolA}','formatted'),('${orgA}','${schoolA}','cancelled'),('${orgB}','${schoolB}','document_received');`,
    );
    await as(adminA);
    const r = await queue();
    expect(r.queue).toHaveLength(3);
    expect(r.counts).toEqual({
      awaiting_preparation: 3,
      missing_original: 3,
      formatted_ready: 1,
    });
    expect(r.queue[0]).not.toHaveProperty('ocr_status');
    await as(adminB);
    expect((await queue()).queue).toHaveLength(1);
  });
  it('denies anonymous, BA and unapproved access to the staff queue', async () => {
    await as(ba);
    await expect(queue()).rejects.toThrow('Approved staff');
    await db.exec('reset role;set role anon');
    await expect(queue()).rejects.toThrow('permission denied');
    await db.exec(
      `reset role;update profiles set account_status='suspended' where id='${adminA}'`,
    );
    await as(adminA);
    await expect(queue()).rejects.toThrow('Approved staff');
  });
});
