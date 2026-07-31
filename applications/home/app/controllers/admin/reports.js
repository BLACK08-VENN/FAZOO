// app/controllers/admin/reports.js
import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

// Canonical activity catalogue. Kept in lockstep with session-form.js so
// the per-activity CSV columns and table breakdowns stay stable across
// exports even when the dataset has zero records of a given activity.
const ACTIVITY_DEFS = [
  { slug: 'crayon_colouring', title: 'Crayon Colouring', short: 'Crayon' },
  { slug: 'watercolour_painting', title: 'Watercolour Painting', short: 'Watercolour' },
  { slug: 'paper_crafts', title: 'Paper Crafts', short: 'Paper' },
];
const TRIBE_BASE_URL = 'https://tribe.fazoo.setarez.com';
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|mkv|3gp|ogv)(\?.*)?$/i;
const MEDIA_EXT_RE = /\.(jpe?g|png|gif|webp|svg|mp4|mov|m4v|webm|avi|mkv|3gp|ogv)(\?.*)?$/i;

const ACTIVITY_TITLE_BY_SLUG = Object.fromEntries(
  ACTIVITY_DEFS.map((a) => [a.slug, a.title]),
);
const ACTIVITY_SHORT_BY_SLUG = Object.fromEntries(
  ACTIVITY_DEFS.map((a) => [a.slug, a.short]),
);

// ── Monthly/Weekly/Daily XLSX report constants & helpers ─────────────────────
//
// These three reports mirror the "Art & Craft Activation REPORT" template
// exactly: a per-month workbook with three sheets — "Monthly SUMMARY",
// "<Month> Weekly", "<Month> DAILY". The dropdown lists one entry per month
// from May 2026 through the month of the most recent session log.
//
// Template quirk preserved intentionally: on the Weekly and Daily sheets the
// header row reads "REGION | BA", but the underlying data is BA-name in the
// REGION column and region in the BA column (i.e. name-in-B, region-in-C),
// matching the source workbook's actual cell layout.

const REPORT_MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const REPORT_START_YEAR = 2026;
const REPORT_START_MONTH = 4; // May (0-based)
const UNLISTED_REGION = 'Unlisted';

function _titleCaseMonth(name) {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

function _dayOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "4th May", "21st May" — label for a daily column.
function _dayColumnLabel(dateStr, monthName) {
  const day = parseInt(dateStr.slice(8, 10), 10);
  return `${_dayOrdinal(day)} ${_titleCaseMonth(monthName)}`;
}

// Week-of-month: days 1-7 → week 1, 8-14 → week 2, etc. (not ISO weeks).
function _weekOfMonth(dateStr) {
  const day = parseInt(dateStr.slice(8, 10), 10);
  return Math.floor((day - 1) / 7) + 1;
}

export default class AdminReportsController extends Controller {
  @service adminAuth;

  // ── Date range ─────────────────────────────────────────────────────────────
  @tracked dateFrom = this._defaultFrom();
  @tracked dateTo   = this._defaultTo();

  // ── Modal state ────────────────────────────────────────────────────────────
  @tracked selectedSession = null;
  @tracked slideIndex      = 0;

  // ── Image ZIP export state ─────────────────────────────────────────────────
  @tracked zipUrl      = null;
  @tracked zipBuilding = false;
  @tracked zipImageCount = 0;
  @tracked zipAttempted = false;
  @tracked zipReady    = false;
  _zipTimer = null;

  constructor() {
    super(...arguments);
    // Prune stale export zips on every visit (fire-and-forget, no cron).
    fetch(`${TRIBE_BASE_URL}/custom/reports/prune-exports.php`, {
      method: 'GET',
      keepalive: true,
    }).catch(() => {});
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _defaultFrom() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }

  _defaultTo() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Learner-count helpers (handle both new + legacy shapes) ────────────────
  //
  // New records carry `modules.learner_counts`, an object keyed by activity
  // slug. Legacy records carry only `modules.learner_count` (a single
  // combined integer). Every read path goes through these helpers so totals
  // and breakdowns stay correct across the boundary.

  /** True when the session has the new per-activity counts shape. */
  _hasLearnerCounts(s) {
    const lc = s?.modules?.learner_counts;
    return !!lc && typeof lc === 'object' && !Array.isArray(lc);
  }

  /** Total learners for one session — uses the per-activity sum when
   *  available, otherwise the legacy combined integer. */
  _learnerTotal(s) {
    if (this._hasLearnerCounts(s)) {
      return Object.values(s.modules.learner_counts).reduce(
        (sum, v) => sum + (parseInt(v, 10) || 0),
        0,
      );
    }
    return parseInt(s?.modules?.learner_count, 10) || 0;
  }

  /** Per-activity entries for the modal / table breakdown. Returns an
   *  empty array for legacy records (caller falls back to the combined
   *  total). Order follows ACTIVITY_DEFS. */
  _learnerBreakdownEntries(s) {
    if (!this._hasLearnerCounts(s)) return [];
    const lc = s.modules.learner_counts;
    return ACTIVITY_DEFS.filter((a) => lc[a.slug] != null && lc[a.slug] !== '')
      .map((a) => ({
        slug: a.slug,
        title: a.title,
        short: a.short,
        count: parseInt(lc[a.slug], 10) || 0,
      }));
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get filteredSessions() {
    const from = new Date(this.dateFrom);
    const to   = new Date(this.dateTo);
    to.setHours(23, 59, 59, 999);
    return (this.model?.sessions ?? []).filter(s => {
      const d = new Date(s.modules.session_date);
      return d >= from && d <= to;
    });
  }

  get totalLearners() {
    return this.filteredSessions.reduce(
      (sum, s) => sum + this._learnerTotal(s),
      0,
    );
  }

  get monthlyLearners() {
    const cutoff = new Date();
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);
    return (this.model?.sessions ?? [])
      .filter(s => new Date(s.modules.session_date) >= cutoff)
      .reduce((sum, s) => sum + this._learnerTotal(s), 0);
  }

  /**
   * Decorated view of `filteredSessions` for the templates: each entry pairs
   * the original record with its resolved learner total and per-activity
   * breakdown. Templates iterate this rather than calling helpers per row.
   */
  get filteredSessionsDecorated() {
    return this.filteredSessions.map((s) => ({
      raw: s,
      total: this._learnerTotal(s),
      breakdown: this._learnerBreakdownEntries(s),
      isLegacy: !this._hasLearnerCounts(s),
    }));
  }

  get mappableSessions() {
    return this.filteredSessions.filter(
      s => s.modules.checkin_latitude && s.modules.checkin_longitude
    );
  }

  get allMediaLinks() {
    const links = [];
    this.filteredSessions.forEach(s => {
      const ml = s.modules.media_links;
      if (Array.isArray(ml)) {
        ml.forEach(url => links.push({ url, session: s.modules.title }));
      } else if (ml) {
        links.push({ url: ml, session: s.modules.title });
      }
    });
    return links;
  }

  get modalSlides() {
    if (!this.selectedSession) return [];
    const ml = this.selectedSession.modules.media_links;
    if (Array.isArray(ml)) return ml;
    if (ml) return [ml];
    return [];
  }

  get currentSlide() {
    return this.modalSlides[this.slideIndex] ?? null;
  }

  get isImage() {
    return /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(this.currentSlide ?? '');
  }

  get selectedSessionBaTitle() {
    if (!this.selectedSession) return '—';
    const baId = this.selectedSession.modules.ba;
    const ba   = (this.model?.bas ?? []).find(b => b.id === baId);
    return ba?.modules?.title ?? baId ?? '—';
  }

  get selectedSessionSchoolTitle() {
    if (!this.selectedSession) return '—';
    const schId  = this.selectedSession.modules.school;
    const school = (this.model?.schools ?? []).find(sc => sc.id === schId);
    return school?.modules?.title ?? schId ?? '—';
  }

  get activityLabel() {
    const map = {
      crayon_colouring:     'Crayon Colouring',
      watercolour_painting: 'Watercolour Painting',
      paper_crafts:         'Paper Crafts',
    };
    return (
      map[this.selectedSession?.modules?.activity_type] ??
      this.selectedSession?.modules?.activity_type ??
      '—'
    );
  }

  // ── Modal: learner breakdown ───────────────────────────────────────────────

  get selectedSessionTotalLearners() {
    return this.selectedSession ? this._learnerTotal(this.selectedSession) : 0;
  }

  /** Ordered breakdown entries for the modal — empty for legacy records. */
  get selectedSessionLearnerBreakdown() {
    return this.selectedSession
      ? this._learnerBreakdownEntries(this.selectedSession)
      : [];
  }

  /** True for older records that only carry a combined `learner_count`. */
  get selectedSessionIsLegacyCounts() {
    return (
      !!this.selectedSession && !this._hasLearnerCounts(this.selectedSession)
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  @action
  setDateFrom(e) {
    this.dateFrom = e.target.value;
  }

  @action
  setDateTo(e) {
    this.dateTo = e.target.value;
  }

  @action
  setQuickRange(days) {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    this.dateTo   = to.toISOString().slice(0, 10);
    this.dateFrom = from.toISOString().slice(0, 10);
  }

  @action
  openSession(session) {
    this.selectedSession = session;
    this.slideIndex      = 0;
    const el = document.getElementById('sessionModal');
    if (el && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(el).show();
    }
  }

  @action
  closeModal() {
    this.selectedSession = null;
    const el = document.getElementById('sessionModal');
    if (el && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(el).hide();
    }
  }

  @action
  prevSlide() {
    if (this.slideIndex > 0) this.slideIndex--;
  }

  @action
  nextSlide() {
    if (this.slideIndex < this.modalSlides.length - 1) this.slideIndex++;
  }

  @action
  goToSlide(i) {
    this.slideIndex = i;
  }

  @action
  exportCsv() {
    const bas     = this.model?.bas     ?? [];
    const schools = this.model?.schools ?? [];

    const resolveTitle = (collection, id) =>
      collection.find(item => item.id === id)?.modules?.title ?? id ?? '';

    // Header layout: existing columns are preserved in their original order;
    // the per-activity learner columns are inserted right after the total so
    // analysts can see the breakdown next to the sum. Legacy rows leave the
    // per-activity cells blank but still report a meaningful total.
    const perActivityHeaders = ACTIVITY_DEFS.map(
      (a) => `Learners — ${a.title}`,
    );

    const header = [
      'Date',
      'School',
      'BA',
      'Activity',
      'Status',
      'Learner Count (Total)',
      ...perActivityHeaders,
      'Notes',
      'Location',
    ];

    const rows = [
      header,
      ...this.filteredSessions.map((s) => {
        const lat = s.modules.checkin_latitude;
        const lng = s.modules.checkin_longitude;
        const location =
          lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '';

        const total = this._learnerTotal(s);
        const counts = this._hasLearnerCounts(s)
          ? s.modules.learner_counts
          : null;
        const perActivityCells = ACTIVITY_DEFS.map((a) => {
          if (!counts) return '';
          const v = counts[a.slug];
          return v == null || v === '' ? '' : parseInt(v, 10) || 0;
        });

        return [
          s.modules.session_date ?? '',
          resolveTitle(schools, s.modules.school),
          resolveTitle(bas, s.modules.ba),
          s.modules.activity_type ?? '',
          s.modules.status ?? '',
          total,
          ...perActivityCells,
          s.modules.notes ?? '',
          location,
        ];
      }),
    ];

    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fazoo-report-${this.dateFrom}-to-${this.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Image ZIP export ───────────────────────────────────────────────────────

  /** Region name for a session, resolved through its school. Mirrors the
   *  roster convention: falls back to 'Unlisted' when unset. */
  _sessionRegion(s) {
    const schId = s?.modules?.school;
    const sch = (this.model?.schools ?? []).find((sc) => sc.id === schId);
    return sch?.modules?.region || UNLISTED_REGION;
  }

  /** School title for a session, falling back to the session title. */
  _sessionSchoolName(s) {
    const schId = s?.modules?.school;
    const sch = (this.model?.schools ?? []).find((sc) => sc.id === schId);
    return sch?.modules?.title || s?.modules?.title || 'Unknown School';
  }

  /** Image + video media URLs for a session (array or scalar media_links). */
  _sessionImageLinks(s) {
    const ml = s?.modules?.media_links;
    const arr = Array.isArray(ml) ? ml : ml ? [ml] : [];
    return arr.filter((u) => typeof u === 'string' && MEDIA_EXT_RE.test(u));
  }

  /**
   * Manifest of every in-range image/video: source_url (tribe-absolute) plus a
   * dest_path of yyyy-mm-dd/<region>/<school>/<filename>. Duplicate dest_paths
   * are disambiguated with a numeric suffix so no file is silently overwritten.
   */
  _buildImageManifest() {
    const seen = new Map();
    const files = [];
    for (const s of this.filteredSessions) {
      const date = (s.modules.session_date ?? '').slice(0, 10) || 'undated';
      const region = this._sessionRegion(s);
      const school = this._sessionSchoolName(s);
      for (const link of this._sessionImageLinks(s)) {
        const path = link.split('?')[0];
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'image';
        let dest = `${date}/${region}/${school}/${filename}`;
        if (seen.has(dest)) {
          const n = seen.get(dest) + 1;
          seen.set(dest, n);
          const dot = filename.lastIndexOf('.');
          const stem = dot > 0 ? filename.slice(0, dot) : filename;
          const ext = dot > 0 ? filename.slice(dot) : '';
          dest = `${date}/${region}/${school}/${stem}-${n}${ext}`;
        } else {
          seen.set(dest, 1);
        }
        files.push({
          source_url: link.startsWith('http') ? link : `${TRIBE_BASE_URL}${link}`,
          dest_path: dest,
        });
      }
    }
    return files;
  }

  @action
  async downloadImagesZip() {
    const files = this._buildImageManifest();
    this.zipAttempted = true;
    this.zipImageCount = files.length;
    this.zipReady = false;
    if (this._zipTimer) { clearTimeout(this._zipTimer); this._zipTimer = null; }
    if (!files.length) {
      this.zipUrl = null;
      this.zipBuilding = false;
      return;
    }

    const token = Math.random().toString(36).slice(2, 10);
    const zipPathRel =
      `exports/images-${this.dateFrom}-to-${this.dateTo}-${token}.zip`;

    this.zipUrl = `${TRIBE_BASE_URL}/uploads/${zipPathRel}`;
    this.zipBuilding = true;

    try {
      await fetch(`${TRIBE_BASE_URL}/custom/reports/export-images.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip_path: zipPathRel, files }),
      });
    } catch (e) {
      // Fire-and-forget: the build proceeds server-side regardless.
    }

    // Pretend-loader: the server finishes building within a few seconds,
    // so after 20s reveal the download and stop the spinner.
    this._zipTimer = setTimeout(() => {
      this.zipBuilding = false;
      this.zipReady = true;
      this._zipTimer = null;
    }, 20000);
  }

  @action
  async copyZipUrl() {
    if (this.zipUrl) {
      try {
        await navigator.clipboard.writeText(this.zipUrl);
      } catch (e) { /* clipboard unavailable */ }
    }
  }

  // ── Monthly / Weekly / Daily XLSX reports ──────────────────────────────────

  /**
   * Months offered in the report dropdown: one per calendar month from
   * May 2026 through the month of the most recent session in the model.
   * Each entry: { year, month (0-based), label: 'May 2026', name: 'MAY' }.
   * The from/to range does not filter this list — selecting an item builds
   * that single month's workbook regardless of the picker.
   */
  get monthlyReportMonths() {
    const dates = (this.model?.sessions ?? [])
      .map((s) => s?.modules?.session_date)
      .filter(Boolean)
      .sort();

    let endYear = REPORT_START_YEAR;
    let endMonth = REPORT_START_MONTH;
    if (dates.length) {
      const last = dates[dates.length - 1];
      endYear = parseInt(last.slice(0, 4), 10);
      endMonth = parseInt(last.slice(5, 7), 10) - 1;
    }

    const out = [];
    let y = REPORT_START_YEAR;
    let m = REPORT_START_MONTH;
    // Guard against a corrupt end date that predates the start.
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const name = REPORT_MONTH_NAMES[m];
      out.push({ year: y, month: m, name, label: `${_titleCaseMonth(name)} ${y}` });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }

  // Canonical BA roster (every BA in model.bas) with an inferred region.
  // Region comes from the schools a BA logged sessions at (across all dates);
  // BAs whose schools carry no region — or who have no sessions — fall under
  // "Unlisted". Sorted by region (Unlisted last) then BA name, so the row
  // order is stable across every sheet and month.
  _reportBaRoster() {
    const bas = this.model?.bas ?? [];
    const schools = this.model?.schools ?? [];
    const sessions = this.model?.sessions ?? [];

    const schoolById = new Map(schools.map((sc) => [sc.id, sc]));
    const regionByBa = new Map();
    for (const s of sessions) {
      if (regionByBa.has(s.modules.ba)) continue;
      const sch = schoolById.get(s.modules.school);
      regionByBa.set(s.modules.ba, sch?.modules?.region || UNLISTED_REGION);
    }

    const roster = bas.map((ba) => ({
      id: ba.id,
      name: ba?.modules?.title ?? ba.id ?? '',
      region: regionByBa.get(ba.id) || UNLISTED_REGION,
    }));

    roster.sort((a, b) => {
      const au = a.region === UNLISTED_REGION ? 1 : 0;
      const bu = b.region === UNLISTED_REGION ? 1 : 0;
      if (au !== bu) return au - bu;
      if (a.region !== b.region) return a.region.localeCompare(b.region);
      return a.name.localeCompare(b.name);
    });
    return roster;
  }

  // Sessions belonging to a given year + 0-based month.
  _sessionsInMonth(year, month) {
    return (this.model?.sessions ?? []).filter((s) => {
      const ds = s?.modules?.session_date;
      if (!ds) return false;
      return (
        parseInt(ds.slice(0, 4), 10) === year &&
        parseInt(ds.slice(5, 7), 10) - 1 === month
      );
    });
  }

  // Per-BA aggregation over a session set: distinct school count + learner sum.
  // Returns { schoolsByBa: Map<baId, Set>, learnersByBa: Map<baId, number> }.
  _aggregateByBa(sessions) {
    const schoolsByBa = new Map();
    const learnersByBa = new Map();
    for (const s of sessions) {
      const ba = s.modules.ba;
      if (!schoolsByBa.has(ba)) schoolsByBa.set(ba, new Set());
      if (s.modules.school) schoolsByBa.get(ba).add(s.modules.school);
      learnersByBa.set(ba, (learnersByBa.get(ba) || 0) + this._learnerTotal(s));
    }
    return { schoolsByBa, learnersByBa };
  }

  _buildMonthlySummarySheet(roster, monthSessions, monthName) {
    const { schoolsByBa, learnersByBa } = this._aggregateByBa(monthSessions);
    const aoa = [
      ['', 'BA', 'REGION', `${monthName} TOTAL SCHOOLS`, `${monthName} TOTAL LEARNERS`],
    ];
    roster.forEach((ba, i) => {
      const sc = schoolsByBa.get(ba.id);
      const ln = learnersByBa.get(ba.id);
      aoa.push([i + 1, ba.name, ba.region, sc ? sc.size : '', ln != null ? ln : '']);
    });
    return {
      aoa,
      merges: [],
      cols: [{ wch: 3 }, { wch: 16.9 }, { wch: 10 }, { wch: 20.1 }, { wch: 20.9 }],
    };
  }

  _buildWeeklySheet(roster, monthSessions, monthName) {
    const weeks = [
      ...new Set(monthSessions.map((s) => _weekOfMonth(s.modules.session_date))),
    ].sort((a, b) => a - b);

    const perWeek = weeks.map((w) =>
      this._aggregateByBa(
        monthSessions.filter((s) => _weekOfMonth(s.modules.session_date) === w),
      ),
    );

    const row1 = ['', '', ''];
    const row2 = ['NO.', 'REGION', 'BA'];
    weeks.forEach((w) => {
      row1.push(`${monthName} WEEK ${w}`, '');
      row2.push('SCHOOLS', 'LEARNERS');
    });
    const aoa = [row1, row2];

    roster.forEach((ba, i) => {
      // name-in-REGION-col, region-in-BA-col: matches the template's data.
      const row = [i + 1, ba.name, ba.region];
      perWeek.forEach(({ schoolsByBa, learnersByBa }) => {
        const sc = schoolsByBa.get(ba.id);
        const ln = learnersByBa.get(ba.id);
        row.push(sc ? sc.size : '', ln != null ? ln : '');
      });
      aoa.push(row);
    });

    const merges = weeks.map((_, idx) => {
      const c = 3 + idx * 2;
      return { s: { r: 0, c }, e: { r: 0, c: c + 1 } };
    });
    const cols = [{ wch: 4.4 }, { wch: 16.9 }, { wch: 10 }];
    weeks.forEach(() => cols.push({ wch: 9.9 }, { wch: 9.9 }));

    return { aoa, merges, cols };
  }

  _buildDailySheet(roster, monthSessions, monthName) {
    const { schoolsByBa: totSchools, learnersByBa: totLearners } =
      this._aggregateByBa(monthSessions);

    const days = [
      ...new Set(monthSessions.map((s) => s.modules.session_date).filter(Boolean)),
    ].sort();

    const perDay = days.map((d) =>
      this._aggregateByBa(monthSessions.filter((s) => s.modules.session_date === d)),
    );

    const row1 = ['', '', '', `${monthName} DAILY SUMMARY`, ''];
    const row2 = ['NO.', 'REGION', 'BA', 'TOTAL SCHOOLS', 'TOTAL LEARNERS'];
    days.forEach((d) => {
      row1.push(_dayColumnLabel(d, monthName), '');
      row2.push('SCHOOLS', 'LEARNERS');
    });
    const aoa = [row1, row2];

    roster.forEach((ba, i) => {
      const sc = totSchools.get(ba.id);
      const ln = totLearners.get(ba.id);
      const row = [i + 1, ba.name, ba.region, sc ? sc.size : '', ln != null ? ln : ''];
      perDay.forEach(({ schoolsByBa, learnersByBa }) => {
        const dsc = schoolsByBa.get(ba.id);
        const dln = learnersByBa.get(ba.id);
        row.push(dsc ? dsc.size : '', dln != null ? dln : '');
      });
      aoa.push(row);
    });

    const merges = [{ s: { r: 0, c: 3 }, e: { r: 0, c: 4 } }];
    days.forEach((_, idx) => {
      const c = 5 + idx * 2;
      merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 1 } });
    });
    const cols = [{ wch: 4.4 }, { wch: 16.9 }, { wch: 10 }, { wch: 15.3 }, { wch: 16 }];
    days.forEach(() => cols.push({ wch: 9.9 }, { wch: 9.9 }));

    return { aoa, merges, cols };
  }

  // Build + download the 3-sheet workbook for a single { year, month, name }.
  async _downloadMonthWorkbook({ year, month, name }) {
    const XLSX = await import('xlsx');
    const roster = this._reportBaRoster();
    const monthSessions = this._sessionsInMonth(year, month);
    const monthTitle = _titleCaseMonth(name);

    const sheets = [
      ['Monthly SUMMARY', this._buildMonthlySummarySheet(roster, monthSessions, name)],
      [`${monthTitle} Weekly`, this._buildWeeklySheet(roster, monthSessions, name)],
      [`${monthTitle} DAILY`, this._buildDailySheet(roster, monthSessions, name)],
    ];

    const wb = XLSX.utils.book_new();
    for (const [sheetName, built] of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(built.aoa);
      if (built.merges?.length) ws['!merges'] = built.merges;
      if (built.cols?.length) ws['!cols'] = built.cols;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    XLSX.writeFile(
      wb,
      `art-craft-activation-${monthTitle.toLowerCase()}-${year}.xlsx`,
    );
  }

  @action
  exportMonthlyReport(monthEntry) {
    return this._downloadMonthWorkbook(monthEntry);
  }
}