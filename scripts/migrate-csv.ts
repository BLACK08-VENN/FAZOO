/**
 * Fazoo legacy-data importer
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off (idempotent) migration of the old Junction dashboard data into the
 * multi-tenant Fazoo database. Run against a Supabase instance with the
 * service-role client (bypasses RLS; used by admins, never shipped to clients).
 *
 *   pnpm migrate:csv --brand=lenovo|veda|all
 *
 * Reads connection details from `apps/admin/.env.local` (already targets the
 * local/remote project). Imports in dependency order and is safe to re-run:
 * users/memberships/stores/schools/campaigns/SKUs/logs/sessions all upsert by
 * a stable key (legacy_id, phone/email, or name).
 *
 * Real customer data (BA names/phones, store/school names, GPS) is pulled from
 * the CSVs at runtime and geocoded from public OSM — NOT committed to seed
 * (AGENTS.md rules 7 & 8).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'migration/data');
const ENV_FILE = resolve(ROOT, 'apps/admin/.env.local');
const GEO_CACHE_FILE = resolve(ROOT, 'scripts/.geocode-cache.json');

// ── tiny logger ──────────────────────────────────────────────────────────────
const log = {
  info: (...a: unknown[]) => console.log('[migrate]', ...a),
  ok: (...a: unknown[]) => console.log('[ok]    ', ...a),
  warn: (...a: unknown[]) => console.warn('[warn]  ', ...a),
  err: (...a: unknown[]) => console.error('[error] ', ...a),
};

// ── environment ──────────────────────────────────────────────────────────────
function loadEnv(): { url: string; serviceKey: string } {
  if (!existsSync(ENV_FILE)) throw new Error(`Missing env file: ${ENV_FILE}`);
  const raw = readFileSync(ENV_FILE, 'utf8');
  const get = (k: string) => {
    const m = raw.match(new RegExp(`^${k}=(.+)$`, 'm'));
    return m?.[1]?.trim() ?? '';
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || get('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return { url, serviceKey };
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function readCsv<T extends object>(file: string): T[] {
  const path = resolve(DATA_DIR, file);
  if (!existsSync(path)) throw new Error(`Missing data file: ${path}`);
  const text = readFileSync(path, 'utf8');
  const parsed = Papa.parse<T>(text, { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.length) log.warn(`${file}: ${parsed.errors.length} parse warning(s)`);
  const rec = parsed.data as Array<Record<string, unknown>>;
  const rows = rec.filter((r) => Object.keys(r).some((k) => String(r[k] ?? '').trim() !== ''));
  log.info(`${file}: ${rows.length} rows`);
  return rows as unknown as T[];
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

// All Lenovo report exports (single master file + per-BA exports) share the
// same schema. Dedupe by BA ID + Date, preferring rows that carry SKU data.
function readLenovoReports(): Array<Record<string, string>> {
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('lenovo-report-2026-08-20-to-2026-08-27') && f.endsWith('.csv'))
    .sort();
  const rows: Array<Record<string, string>> = [];
  for (const f of files) rows.push(...readCsv<Record<string, string>>(f));
  const byKey = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const key = `${str(r['BA ID'])}|${str(r.Date)}`;
    const existing = byKey.get(key);
    if (!existing || str(r['SKUs Sold'])) byKey.set(key, r);
  }
  return [...byKey.values()].map((r) => ({ ...r }));
}

// Parse a "SKUs Sold" cell like "i5 ×2" or "Celeron ×1, i3 ×2".
function parseSkuCell(cell: string): Array<{ code: string; qty: number }> {
  const out: Array<{ code: string; qty: number }> = [];
  const re = /([A-Za-z0-9][A-Za-z0-9 .\-]*?)\s*[x×X]\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) {
    const code = m[1]!.trim();
    const qty = Number(m[2]);
    if (code && qty > 0) out.push({ code, qty });
  }
  return out;
}

// ── telephony: normalize to E.164 per country ────────────────────────────────
// Nigerian: 0XXXXXXXXX or +234XXXXXXXXX → +234XXXXXXXXX
// Kenyan:   0XXXXXXXXX or 7/1XXXXXXXX (9-digit) → +254XXXXXXXXX
function normalizePhone(raw: string, country: 'NG' | 'KE'): string {
  let d = str(raw).replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  if (country === 'NG') {
    if (d.startsWith('234')) d = d.slice(3);
    if (d.startsWith('0')) d = d.slice(1);
    return '+234' + d;
  }
  // Kenya
  if (d.startsWith('254')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (/^[17]\d{8}$/.test(d)) return '+254' + d;
  return '+254' + d; // best-effort
}

function fictitiousEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `ba.${digits}@legacy-import.fazoo.app`;
}

// ── geocoding (Nominatim, ToS-compliant: ≤1 req/s, real UA) ─────────────────
type GeoCache = Record<string, { lat: number; lon: number } | null>;

function loadGeoCache(): GeoCache {
  if (existsSync(GEO_CACHE_FILE)) {
    try {
      return JSON.parse(readFileSync(GEO_CACHE_FILE, 'utf8'));
    } catch {
      /* ignore corrupt cache */
    }
  }
  return {};
}

async function geocode(
  query: string,
  cache: GeoCache,
  rate: { last: number },
): Promise<{ lat: number; lon: number } | null> {
  const key = query.toLocaleLowerCase();
  if (key in cache) return cache[key] ?? null;

  // Rate-limit to 1 req/s (Nominatim policy).
  const wait = Math.max(0, 1000 - (Date.now() - rate.last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  rate.last = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'fazoo-legacy-import/1.0 (admin tool)' } });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const hit = data[0];
    const result = hit ? { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) } : null;
    cache[key] = result;
    writeFileSync(GEO_CACHE_FILE, JSON.stringify(cache, null, 2));
    return result;
  } catch (e) {
    log.warn(`geocode failed for "${query}": ${(e as Error).message}`);
    cache[key] = null;
    return null;
  }
}

// ── Supabase service client (raw createClient — avoids server-only guard) ───
let client: SupabaseClient<any>;
let orgIds: { lenovo: string; veda: string } = null!;

async function getOrg(slug: string): Promise<string> {
  const { data } = await client.from('organizations').select('id').eq('slug', slug).single();
  if (!data?.id) throw new Error(`organization "${slug}" not found`);
  return data.id as string;
}

async function orgAccessCode(slug: string): Promise<string | null> {
  const { data } = await client.from('organizations').select('access_code').eq('slug', slug).single();
  return (data?.access_code as string | null) ?? null;
}

// ── BA identity: match by phone/email, else create + attach membership ───────
async function ensureBA(input: {
  orgId: string;
  fullName: string;
  phone: string;
  email?: string;
}): Promise<string> {
  const { orgId, fullName, phone, email } = input;

  // 1) Match an existing approved/known user by phone or email.
  const existing = await findExistingBA(phone, email);
  if (existing) {
    await ensureMembership(existing, orgId, fullName, phone);
    return existing;
  }

  // 2) Create the auth user (trigger creates a pending profile) and attach an
  //    approved membership so the profile mirror aligns.
  const emailFinal = email || fictitiousEmail(phone);
  const password = `${randomBytes(18).toString('base64url')}!A7`;
  const { data: created, error } = await client.auth.admin.createUser({
    email: emailFinal,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, organization_slug: slugForOrg(orgId) },
  });
  if (error) throw new Error(`createUser ${emailFinal}: ${error.message}`);
  const userId = created.user!.id;
  log.ok(`created user ${emailFinal} (${fullName})`);
  await ensureMembership(userId, orgId, fullName, phone);
  return userId;
}

function slugForOrg(orgId: string): 'lenovo-nigeria' | 'veda' {
  return orgId === orgIds.lenovo ? 'lenovo-nigeria' : 'veda';
}

async function findExistingBA(phone: string, email?: string): Promise<string | null> {
  if (phone) {
    const { data: p } = await client.from('profiles').select('id').eq('phone', phone).maybeSingle();
    if (p?.id) return p.id as string;
  }
  if (email) {
    const { data: u } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const hit = u?.users.find((x: { email?: string | null; id: string }) => x.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      const { data: p } = await client.from('profiles').select('id').eq('id', hit.id).maybeSingle();
      if (p?.id) return p.id as string;
    }
  }
  return null;
}

async function ensureMembership(userId: string, orgId: string, fullName: string, phone: string) {
  const { data: existing } = await client
    .from('organization_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (existing?.id) return;

  const code = await orgAccessCode(slugForOrg(orgId));
  const { error } = await client.from('organization_memberships').insert({
    user_id: userId,
    organization_id: orgId,
    role: 'brand_ambassador',
    account_status: 'approved',
    access_code_used: code,
    code_granted_at: new Date().toISOString(),
  });
  if (error) throw new Error(`membership insert (${fullName} @ ${slugForOrg(orgId)}): ${error.message}`);
  // Keep the BA's display name on the profile too.
  await client.from('profiles').update({ full_name: fullName, phone }).eq('id', userId);
  log.ok(`membership: ${fullName} → ${slugForOrg(orgId)}`);
}

// ── Lenovo import ────────────────────────────────────────────────────────────
async function importLenovo() {
  log.info('── importing Lenovo ──');
  const orgId = orgIds.lenovo;

  // Stores (name + legacy id), geocoded. Unresolvable names keep placeholder
  // coords (0,0) flagged "needs geocoding" so admins can fill real ones later.
  const storesRaw = readCsv<{ id: string; title: string }>('lenovo-stores.csv');
  const geoCache = loadGeoCache();
  const rate = { last: 0 };
  const storeIdByName = new Map<string, string>();
  const geoStores: GeoStore[] = [];
  for (const s of storesRaw) {
    const name = str(s.title);
    const g = await geocode(`${name}, Nigeria`, geoCache, rate);
    if (!g) {
      log.warn(`no geocode for store "${name}" — placeholder 0,0 (needs admin to set)`);
    }
    const address = g ? `${name} (legacy id ${str(s.id)})` : `${name} (legacy id ${str(s.id)}) — needs geocoding`;
    const { data: existing } = await client
      .from('stores')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', name)
      .maybeSingle();
    const { data, error } = existing?.id
      ? await client.from('stores').update({ name, address }).eq('id', existing.id).select('id').single()
      : await client
          .from('stores')
          .insert({
            organization_id: orgId,
            name,
            address,
            latitude: g?.lat ?? 0,
            longitude: g?.lon ?? 0,
            status: 'active',
          })
          .select('id')
          .single();
    if (error) throw new Error(`store "${name}": ${error.message}`);
    storeIdByName.set(name, data.id as string);
    if (g) geoStores.push({ id: data.id as string, lat: g.lat, lon: g.lon });
    log.ok(`store: ${name} @ ${g ? `${g.lat.toFixed(4)},${g.lon.toFixed(4)}` : 'unresolved'}`);
  }

  // Campaign (temporary) covering the report window.
  const report = readLenovoReports();
  const dates = report.map((r) => str(r['Date'])).filter((d) => !!d);
  if (dates.length === 0) throw new Error('no dates found in lenovo report');
  const start = dates.reduce((a, b) => (a < b ? a : b));
  const end = dates.reduce((a, b) => (a > b ? a : b));
  const campaignName = 'Lenovo Legacy Import Aug 2026';
  const { data: existingCampaign } = await client
    .from('campaigns')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', campaignName)
    .maybeSingle();
  const { data: campaign, error: campErr } = existingCampaign?.id
    ? await client.from('campaigns').select('id').eq('id', existingCampaign.id).single()
    : await client
        .from('campaigns')
        .insert({
          organization_id: orgId,
          name: campaignName,
          description: 'Temporary campaign for legacy 2026-08 import; assign BAs/stores and sales later.',
          start_date: start,
          end_date: end,
          status: 'completed',
        })
        .select('id')
        .single();
  if (campErr) throw new Error(`campaign: ${campErr.message}`);
  const campaignId = campaign.id as string;
  log.ok(`campaign: ${campaignName} (${start} → ${end})`);

  // SKUs + code→id map (for attaching sales entries below).
  const skus = readCsv<{ sku: string; units: string; logs: string }>('lenovo-skus.csv');
  const skuIdByCode = new Map<string, string>();
  for (const k of skus) {
    const name = str(k.sku);
    const { data, error } = await client
      .from('skus')
      .upsert({ organization_id: orgId, campaign_id: campaignId, name, code: name, status: 'active' }, { onConflict: 'campaign_id,code' })
      .select('id')
      .single();
    if (error) throw new Error(`sku "${name}": ${error.message}`);
    skuIdByCode.set(name.toLowerCase(), data.id as string);
    log.ok(`sku (reference): ${name}`);
  }
  if (skuIdByCode.size === 0) log.warn('no SKUs available; sales entries will be skipped');

  // BAs (match by phone else create) + daily logs.
  const baByLine = new Map<number, string>();
  for (const row of report) {
    const rawPhone = str(row['BA Phone']);
    let phone = rawPhone;
    try {
      phone = normalizePhone(rawPhone, 'NG');
    } catch {
      /* keep raw */
    }
    const name = str(row['BA Name']);
    const key = Number(str(row['BA ID']));
    if (!baByLine.has(key)) {
      const uid = await ensureBA({ orgId, fullName: name, phone });
      baByLine.set(key, uid);
    }
  }

  // Daily logs.
  // Store assignment: nearest geocoded store within 5km of the BA's check-in
  // point; otherwise a per-org "Unknown Location" placeholder store.
  const fallbackStoreId = await ensureUnknownStore(orgId);
  for (const row of report) {
    const baId = baByLine.get(Number(str(row['BA ID'])));
    if (!baId) continue;
    const date = str(row.Date);
    const checkin = parseTime(row['Check-in Time'], date, start);
    const checkout = parseTime(row['Check-out Time'], date, start);
    const checkedOut = str(row['Checked Out']).toLowerCase() === 'yes' && checkout;
    const checkinGps = parseGps(str(row['Check-in GPS']));
    const checkoutGps = parseGps(str(row['Check-out GPS']));

    let assignedStore: string = fallbackStoreId;
    if (checkinGps && geoStores.length > 0) {
      const near = nearestStore(checkinGps, geoStores);
      if (near && haversineMetres(checkinGps.lat, checkinGps.lon, near.lat, near.lon) <= 5000) {
        assignedStore = near.id;
      }
    }

    let logId: string | undefined;
    const { data: existing } = await client
      .from('daily_logs')
      .select('id')
      .eq('brand_ambassador_id', baId)
      .eq('campaign_id', campaignId)
      .eq('attendance_date', date)
      .maybeSingle();
    if (existing?.id) {
      logId = existing.id;
    } else {
      const { data: inserted, error } = await client
        .from('daily_logs')
        .insert({
          organization_id: orgId,
          campaign_id: campaignId,
          brand_ambassador_id: baId,
          store_id: assignedStore,
          attendance_date: date,
          attendance_status: 'present',
          checkin_at: checkin,
          checkout_at: checkout,
          checkin_latitude: checkinGps?.lat ?? null,
          checkin_longitude: checkinGps?.lon ?? null,
          checkout_latitude: checkoutGps?.lat ?? null,
          checkout_longitude: checkoutGps?.lon ?? null,
          notes: str(row.Notes) || null,
          status: checkedOut ? 'completed' : 'open',
          flagged: false,
        })
        .select('id')
        .single();
      if (error) throw new Error(`daily_log ${date} ${row['BA Name']}: ${error.message}`);
      logId = inserted?.id as string | undefined;
    }

    // Sales entries from the "SKUs Sold" cell (idempotent per log + sku).
    if (logId) {
      const items = parseSkuCell(str(row['SKUs Sold']));
      for (const it of items) {
        const skuId = skuIdByCode.get(it.code.toLowerCase());
        if (!skuId) {
          log.warn(`Lenovo: SKU "${it.code}" on ${date} not in campaign; skipped`);
          continue;
        }
        const { data: existingEntry } = await client
          .from('sales_entries')
          .select('id')
          .eq('daily_log_id', logId)
          .eq('sku_id', skuId)
          .maybeSingle();
        if (existingEntry?.id) continue;
        const { error } = await client.from('sales_entries').insert({
          organization_id: orgId,
          daily_log_id: logId,
          sku_id: skuId,
          quantity: it.qty,
        });
        if (error) throw new Error(`sales_entry ${date} ${it.code}: ${error.message}`);
        log.ok(`sales: ${date} ${row['BA Name']} ${it.code} ×${it.qty}`);
      }
    }
  }
  log.ok(`Lenovo: ${storeIdByName.size} stores, ${baByLine.size} BAs, ${report.length} log rows`);

  // daily_log photo rows are NOT imported: storage is private and the source
  // URLs are legacy-dashboard external CDN links (not our private storage).
}

function parseTime(raw: string | undefined, date: string, _start: string): string | null {
  const t = str(raw);
  if (!t || t === '—' || t === '-') return null;
  // Format e.g. "07:01 PM"
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return `${date}T00:00:00.000Z`;
  let h = Number(m[1]);
  const min = m[2]!;
  const ap = m[3]!.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${min}:00.000Z`;
}

function parseGps(url: string): { lat: number; lon: number } | null {
  if (!url) return null;
  const m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]!), lon: parseFloat(m[2]!) };
  return null;
}

// ── haversine distance (client-side; mirrors DB distance_metres) ─────────────
function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface GeoStore { id: string; lat: number; lon: number }

function nearestStore(gps: { lat: number; lon: number }, stores: GeoStore[]): GeoStore | null {
  let best: GeoStore | null = null;
  let bestD = Infinity;
  for (const s of stores) {
    const d = haversineMetres(gps.lat, gps.lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Per-org fallback store for logs that can't be assigned to a geocoded store.
async function ensureUnknownStore(orgId: string): Promise<string> {
  const name = 'Unknown Location (Legacy Import)';
  const { data: existing } = await client
    .from('stores')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await client
    .from('stores')
    .insert({
      organization_id: orgId,
      name,
      address: `${name} — placeholder; assign a real store and coordinates later`,
      latitude: 0,
      longitude: 0,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`unknown store: ${error.message}`);
  return data.id as string;
}

// ── Veda import ──────────────────────────────────────────────────────────────
const ACTIVITY_ORDER: Record<string, number> = {
  crayon_colouring: 1,
  watercolour_painting: 2,
  paper_crafts: 3,
};

// Session titles look like "<School Name> — 2026-07-30"; derive the school name
// by stripping a trailing separator + date only (keeps hyphens in school names).
function deriveSchoolName(title: string): string {
  return title
    .replace(/\s*(?:—|-)\s*\d{4}-\d{2}-\d{2}\s*$/u, '')
    .trim();
}

async function importVedaBAs(
  orgId: string,
  file = 'veda-brand-ambassadors.csv',
): Promise<Map<string, string>> {
  const basRaw = readCsv<{ legacy_id: string; full_name: string; phone: string; email: string; is_admin: string }>(file);
  const baByLegacy = new Map<string, string>();
  for (const b of basRaw) {
    const email = str(b.email).toLowerCase();
    if (!email || !email.includes('@')) {
      // No email → match by phone or create with fictitious email.
      const phone = normalizePhone(b.phone, 'KE');
      const uid = await ensureBA({ orgId, fullName: str(b.full_name), phone });
      baByLegacy.set(str(b.legacy_id), uid);
      continue;
    }
    // Match by email first so existing accounts are reused.
    const existing = await findExistingBA('', email);
    const userId = existing ?? await ensureBA({ orgId, fullName: str(b.full_name), phone: normalizePhone(b.phone, 'KE'), email });
    baByLegacy.set(str(b.legacy_id), userId);
  }
  return baByLegacy;
}

async function importVeda() {
  log.info('── importing Veda ──');
  const orgId = orgIds.veda;
  const geoCache = loadGeoCache();
  const rate = { last: 0 };

  // Schools, resolved by legacy_id. Records are created on demand (from the
  // schools CSV, or derived from a session title when a session references a
  // school not listed in the CSV) so no session is dropped for want of a venue.
  const schoolIdByLegacy = new Map<string, string>();
  async function ensureVedaSchool(
    legacyId: string,
    name: string,
    region?: string,
    address?: string,
    skipGeocoding = false,
  ): Promise<string> {
    const existing = schoolIdByLegacy.get(legacyId);
    if (existing) return existing;
    const key = `${name}${region ? `, ${region}` : ''}, Kenya`;
    const g = skipGeocoding ? null : await geocode(key, geoCache, rate);
    const { data, error } = await client
      .from('veda_schools')
      .upsert(
        {
          organization_id: orgId,
          legacy_id: Number(legacyId),
          name,
          address: address || null,
          region: region || null,
          latitude: g?.lat ?? null,
          longitude: g?.lon ?? null,
          status: 'active',
        },
        { onConflict: 'organization_id,legacy_id' },
      )
      .select('id')
      .single();
    if (error) throw new Error(`veda_school "${name}": ${error.message}`);
    schoolIdByLegacy.set(legacyId, data.id as string);
    log.ok(`school: ${name} (${region ?? ''}) ${g ? `@ ${g.lat.toFixed(3)},${g.lon.toFixed(3)}` : 'unresolved'}`);
    return data.id as string;
  }

  const schoolsFile = process.argv.find((a) => a.startsWith('--veda-schools-file='))?.split('=')[1]
    ?? 'veda-schools.csv';
  const skipSchoolGeocoding = process.argv.includes('--skip-school-geocoding');
  const schoolsRaw = readCsv<{ id: string; title: string; region: string; address?: string }>(schoolsFile);

  // A current school register can be loaded without sessions or geocoding.
  // Batch it to avoid thousands of sequential network round trips.
  if (process.argv.includes('--only=schools') && skipSchoolGeocoding) {
    const records = schoolsRaw.map((s) => ({
      organization_id: orgId,
      legacy_id: Number(str(s.id)),
      name: str(s.title),
      address: str(s.address) || null,
      region: str(s.region) || null,
      latitude: null,
      longitude: null,
      status: 'active' as const,
    }));
    const batchSize = 500;
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      const { error } = await client
        .from('veda_schools')
        .upsert(batch, { onConflict: 'organization_id,legacy_id' });
      if (error) throw new Error(`Veda school batch ${offset / batchSize + 1}: ${error.message}`);
      log.ok(`schools: ${Math.min(offset + batch.length, records.length)}/${records.length}`);
    }
    const { count, error: countError } = await client
      .from('veda_schools')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('legacy_id', 1000001)
      .lte('legacy_id', 1000000 + records.length);
    if (countError) throw new Error(`Veda school verification: ${countError.message}`);
    if (count !== records.length) {
      throw new Error(`Veda school verification: expected ${records.length}, found ${count ?? 0}`);
    }
    log.ok(`Veda: ${records.length} schools imported`);
    return;
  }

  for (const s of schoolsRaw) {
    await ensureVedaSchool(
      str(s.id),
      str(s.title),
      str(s.region),
      str(s.address),
      skipSchoolGeocoding,
    );
  }

  if (process.argv.includes('--only=schools')) {
    log.ok(`Veda: ${schoolIdByLegacy.size} schools imported`);
    return;
  }

  // BA registry by legacy id from the BA csv (email → user), sessions reference ba_id.
  const baByLegacy = await importVedaBAs(orgId);

  // Sessions + activities.
  const sessionsRaw = readCsv<{
    id: string; title: string; school_id: string; ba_id: string; session_date: string;
    activity_type: string; status: string; learner_count: string;
  }>('veda-sessions.csv');

  let inserted = 0;
  for (const s of sessionsRaw) {
    const legacyId = Number(s.id);
    let schoolId = schoolIdByLegacy.get(str(s.school_id));
    if (!schoolId) {
      const derivedName = deriveSchoolName(str(s.title));
      schoolId = await ensureVedaSchool(str(s.school_id), derivedName);
      log.warn(`session ${legacyId}: school ${s.school_id} not in CSV — auto-created "${derivedName}"`);
    }
    const baId = baByLegacy.get(str(s.ba_id));
    if (!baId) {
      log.warn(`session ${legacyId}: BA ${s.ba_id} not resolved — skipping`);
      continue;
    }
    const learnerTotal = Number(str(s.learner_count)) || 0;
    const sessionDate = str(s.session_date);

    const { data: existing } = await client
      .from('veda_sessions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('legacy_id', legacyId)
      .maybeSingle();
    let sessionId = (existing?.id as string | null) ?? null;
    if (!sessionId) {
      const { data, error } = await client
        .from('veda_sessions')
        .upsert(
          {
            organization_id: orgId,
            legacy_id: legacyId,
            school_id: schoolId,
            brand_ambassador_id: baId,
            session_date: sessionDate,
            learner_count: learnerTotal,
            status: (str(s.status) === 'completed' ? 'completed' : 'open') as 'completed' | 'open',
          },
          { onConflict: 'organization_id,legacy_id' },
        )
        .select('id')
        .single();
      if (error) throw new Error(`veda_session ${legacyId}: ${error.message}`);
      sessionId = data.id as string;
    }

    // Activities from the comma-separated list (each with the total count).
    const activities = str(s.activity_type)
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter((a) => ACTIVITY_ORDER[a] !== undefined);
    for (const act of activities) {
      const { error } = await client.from('veda_activities').upsert(
        { organization_id: orgId, session_id: sessionId, activity_type: act, learner_count: learnerTotal },
        { onConflict: 'session_id,activity_type' },
      );
      if (error) throw new Error(`veda_activity ${sessionId}/${act}: ${error.message}`);
    }
    inserted++;
  }
  log.ok(`Veda: ${schoolIdByLegacy.size} schools, ${baByLegacy.size} BAs, ${inserted} sessions`);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv.find((a) => a.startsWith('--brand='));
  const brand = (arg?.split('=')[1] ?? 'all').toLowerCase();
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.toLowerCase();
  const vedaBasFile = process.argv.find((a) => a.startsWith('--veda-bas-file='))?.split('=')[1];
  if (!['lenovo', 'veda', 'all'].includes(brand)) throw new Error(`--brand must be lenovo|veda|all`);
  if (only && !['bas', 'schools'].includes(only)) throw new Error(`--only must be bas|schools`);
  if (only && brand !== 'veda') throw new Error(`--only=${only} requires --brand=veda`);

  const env = loadEnv();
  client = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  orgIds = {
    lenovo: await getOrg('lenovo-nigeria'),
    veda: await getOrg('veda'),
  };
  log.info(`connected to ${env.url}`);

  if (only === 'bas') {
    const imported = await importVedaBAs(orgIds.veda, vedaBasFile || 'veda-brand-ambassadors.csv');
    log.ok(`Veda: ${imported.size} BAs processed`);
    return;
  }

  if (brand === 'lenovo' || brand === 'all') await importLenovo();
  if (brand === 'veda' || brand === 'all') await importVeda();
  log.ok('done');
}

main().catch((e) => {
  log.err(e instanceof Error ? e.message : e);
  process.exit(1);
});
