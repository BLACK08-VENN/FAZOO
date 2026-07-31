// app/controllers/lenovo/report.js
import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { Offcanvas } from 'bootstrap';

export default class LenovoReportController extends Controller {
  @service adminAuth;

  // ── Date range ────────────────────────────────────────────────────────────
  @tracked dateFrom = this._defaultFrom();
  @tracked dateTo   = this._defaultTo();

  // ── Filters ───────────────────────────────────────────────────────────────
  @tracked selectedBaId = ''; // '' = all BAs

  // ── Modal state ───────────────────────────────────────────────────────────
  @tracked selectedLog  = null;
  @tracked slideIndex   = 0;

  // ── Photo offcanvas state ─────────────────────────────────────────────────
  @tracked selectedRowForPhotos = null;

  // ── Private helpers ───────────────────────────────────────────────────────

  _defaultFrom() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }

  _defaultTo() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Parse skus_sold defensively — the field is a JSON string on the model
   * but may arrive already-parsed in some environments.
   */
  _parseSales(log) {
    const raw = log?.modules?.skus_sold;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Total units across all line items for one log. */
  _logTotalUnits(log) {
    return this._parseSales(log).reduce(
      (sum, s) => sum + (parseInt(s.quantity, 10) || 0),
      0,
    );
  }

  _parseMediaLinks(log) {
    const raw = log?.modules?.media_links;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    } catch {
      return typeof raw === 'string' ? [raw] : [];
    }
  }

  /** Human-readable label for a media slot by its index in the array. */
  _mediaLabel(index) {
    return index === 0 ? 'Stock on shelf' : index === 1 ? 'Uniform' : `Photo ${index + 1}`;
  }

  /** Format an ISO datetime string to a readable local time, e.g. "14:32". */
  _formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  /** Date portion of an ISO string — safe fallback to the raw value. */
  _isoToDate(iso) {
    if (!iso) return null;
    try {
      return new Date(iso);
    } catch {
      return null;
    }
  }

  get filteredLogs() {
    const from = new Date(this.dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(this.dateTo);
    to.setHours(23, 59, 59, 999);

    return (this.model?.logs ?? []).filter((log) => {
      // Date filter — we use checkin_datetime as the canonical day marker.
      const checkinDate = this._isoToDate(log.modules?.checkin_datetime);
      if (!checkinDate || checkinDate < from || checkinDate > to) return false;

      // BA filter
      if (this.selectedBaId && String(log.modules?.lenovo_ba) !== String(this.selectedBaId)) {
        return false;
      }

      return true;
    });
  }

  get filteredLogsDecorated() {
    const bas = this.model?.bas ?? [];

    return this.filteredLogs.map((log) => {
      const ba = bas.find((b) => b.id === log.modules?.lenovo_ba);
      const sales = this._parseSales(log);
      const totalUnits = sales.reduce(
        (sum, s) => sum + (parseInt(s.quantity, 10) || 0),
        0,
      );
      const mediaLinks = this._parseMediaLinks(log);
      const hasCheckedOut = !!log.modules?.checkout_datetime;

      return {
        raw: log,
        // FIX: pre-compute the date string here instead of using {{slice}} in the template
        checkinDate: (log.modules?.checkin_datetime ?? '').slice(0, 10),
        baTitle: ba?.modules?.title ?? log.modules?.lenovo_ba ?? '—',
        baPhone: ba?.modules?.phone ?? '',
        checkinTime: this._formatTime(log.modules?.checkin_datetime),
        checkoutTime: hasCheckedOut
          ? this._formatTime(log.modules?.checkout_datetime)
          : '—',
        hasCheckedOut,
        sales,
        totalUnits,
        uniqueSkus: new Set(sales.map((s) => s.sku_id)).size,
        mediaLinks,
        stockPhotoUrl: mediaLinks[0] ?? null,
        uniformPhotoUrl: mediaLinks[1] ?? null,
        hasLocation: !!(
          log.modules?.checkin_latitude && log.modules?.checkin_longitude
        ),
        checkinLatitude: log.modules?.checkin_latitude ?? '',
        checkinLongitude: log.modules?.checkin_longitude ?? '',
      };
    });
  }

  // ── KPI aggregates ────────────────────────────────────────────────────────

  /** Total BA-days (log rows) in the filtered range. */
  get totalLogDays() {
    return this.filteredLogs.length;
  }

  /** Sum of all units sold across the filtered range. */
  get totalUnitsSold() {
    return this.filteredLogs.reduce(
      (sum, log) => sum + this._logTotalUnits(log),
      0,
    );
  }

  /** Number of logs where checkout was completed in range. */
  get totalCheckouts() {
    return this.filteredLogs.filter(
      (log) => !!log.modules?.checkout_datetime,
    ).length;
  }

  /** Number of distinct BAs who have at least one log in range. */
  get activeBaCount() {
    return new Set(
      this.filteredLogs.map((log) => log.modules?.lenovo_ba).filter(Boolean),
    ).size;
  }

  get skuLeaderboard() {
    const map = new Map();
    for (const log of this.filteredLogs) {
      for (const s of this._parseSales(log)) {
        const key = s.sku_id;
        const prev = map.get(key);
        const qty = parseInt(s.quantity, 10) || 0;
        if (prev) {
          prev.quantity += qty;
          prev.logCount += 1;
        } else {
          map.set(key, {
            sku_id: s.sku_id,
            sku_title: s.sku_title,
            quantity: qty,
            logCount: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }

  get baSummary() {
    const bas = this.model?.bas ?? [];
    var bas_m = [];
    bas.forEach((obj)=>{
      bas_m[obj.id] = obj;
    });
    const byBa = new Map();

    for (const log of this.filteredLogs) {
      const baId = log.modules?.lenovo_ba;
      if (!baId) continue;

      if (!byBa.has(baId)) {
        byBa.set(baId, {
          ba: bas_m[baId],
          logCount: 0,
          totalUnits: 0,
          checkoutCount: 0,
        });
      }
      const entry = byBa.get(baId);
      entry.logCount += 1;
      entry.totalUnits += this._logTotalUnits(log);
      if (log.modules?.checkout_datetime) entry.checkoutCount += 1;
    }

    return Array.from(byBa.values())
      .sort((a, b) => b.totalUnits - a.totalUnits)
      .map((entry) => {
        const pct = entry.logCount
          ? Math.round((entry.checkoutCount / entry.logCount) * 100)
          : 0;
        return {
          ...entry,
          completionPct: pct,
          isComplete: entry.checkoutCount === entry.logCount && entry.logCount > 0,
        };
      });
  }

  get logsByBaId() {
    const result = Object.create(null);
    for (const log of this.filteredLogs) {
      const baId = log.modules?.lenovo_ba;
      if (!baId) continue;
      if (!result[baId]) result[baId] = [];
      result[baId].push(log);
    }
    return result;
  }

  get modalSlides() {
    if (!this.selectedLog) return [];
    return this._parseMediaLinks(this.selectedLog);
  }

  get currentSlide() {
    return this.modalSlides[this.slideIndex] ?? null;
  }

  get isImage() {
    return /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(this.currentSlide ?? '');
  }

  get selectedLogBaTitle() {
    if (!this.selectedLog) return '—';
    const baId = this.selectedLog.modules?.lenovo_ba;
    return (
      (this.model?.bas ?? []).find((b) => b.id === baId)?.modules?.title ??
      baId ??
      '—'
    );
  }

  get selectedLogSales() {
    return this.selectedLog ? this._parseSales(this.selectedLog) : [];
  }

  get selectedLogTotalUnits() {
    return this.selectedLogSales.reduce(
      (sum, s) => sum + (parseInt(s.quantity, 10) || 0),
      0,
    );
  }

  get selectedLogCheckinTime() {
    return this._formatTime(this.selectedLog?.modules?.checkin_datetime);
  }

  get selectedLogCheckoutTime() {
    return this.selectedLog?.modules?.checkout_datetime
      ? this._formatTime(this.selectedLog.modules.checkout_datetime)
      : '—';
  }

  get selectedLogMediaLabelled() {
    return this.modalSlides.map((url, i) => ({
      url,
      label: this._mediaLabel(i),
    }));
  }

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
  setBaFilter(e) {
    this.selectedBaId = e.target.value;
  }

  @action
  openLog(log) {
    this.selectedLog = log;
    this.slideIndex  = 0;
    const el = document.getElementById('logModal');
    if (el && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(el).show();
    }
  }

  @action
  closeModal() {
    this.selectedLog = null;
    const el = document.getElementById('logModal');
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
  openPhotos(row, event) {
    // Prevent the parent <tr> click from also opening the log modal.
    if (event?.stopPropagation) event.stopPropagation();
    this.selectedRowForPhotos = row;
    const el = document.getElementById('photoOffcanvas');
    Offcanvas.getOrCreateInstance(el).show();
  }

  @action
  closePhotos() {
    const el = document.getElementById('photoOffcanvas');
    if (el && window.bootstrap) {
      window.bootstrap.Offcanvas.getOrCreateInstance(el).hide();
    }
    this.selectedRowForPhotos = null;
  }

  @action
  exportCsv() {
    const header = [
      'Date',
      'BA ID',
      'BA Name',
      'BA Phone',
      'Check-in Time',
      'Check-out Time',
      'Checked Out',
      'SKUs Sold',
      'Total Units',
      'Check-in GPS',
      'Check-out GPS',
      'Notes',
      'Stock Photo URL',
      'Uniform Photo URL',
    ];

    const bas     = this.model?.bas ?? [];
    var bas_m = [];
    bas.forEach((obj)=>{
      bas_m[obj.id] = obj;
    });

    const rows = [
      header,
      ...this.filteredLogs.map((log) => {
        const sales   = this._parseSales(log);
        const ba      = bas_m[log.modules.lenovo_ba];
        const baId    = log.modules.lenovo_ba;
        const baTitle = ba?.modules?.title ?? log.modules?.lenovo_ba ?? '';
        const baPhone = ba?.modules?.phone ?? '';

        const checkinLat  = log.modules?.checkin_latitude  ?? '';
        const checkinLng  = log.modules?.checkin_longitude ?? '';
        const checkoutLat = log.modules?.checkout_latitude  ?? '';
        const checkoutLng = log.modules?.checkout_longitude ?? '';

        const checkinGps  = checkinLat  && checkinLng  ? `https://www.google.com/maps?q=${checkinLat},${checkinLng}`   : '';
        const checkoutGps = checkoutLat && checkoutLng ? `https://www.google.com/maps?q=${checkoutLat},${checkoutLng}` : '';

        const skusSummary = sales
          .map((s) => `${s.sku_title} ×${s.quantity}`)
          .join('; ');
        const totalUnits  = this._logTotalUnits(log);

        const mediaLinks    = this._parseMediaLinks(log);
        const stockPhotoUrl = mediaLinks[0] ?? '';
        const uniformUrl    = mediaLinks[1] ?? '';

        const dateStr     = (log.modules?.checkin_datetime ?? '').slice(0, 10);
        const checkedOut  = log.modules?.checkout_datetime ? 'Yes' : 'No';

        return [
          dateStr,
          baId,
          baTitle,
          baPhone,
          this._formatTime(log.modules?.checkin_datetime),
          this._formatTime(log.modules?.checkout_datetime),
          checkedOut,
          skusSummary,
          totalUnits,
          checkinGps,
          checkoutGps,
          log.modules?.notes ?? '',
          stockPhotoUrl,
          uniformUrl,
        ];
      }),
    ];

    const csv  = rows
      .map((r) =>
        r
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lenovo-report-${this.dateFrom}-to-${this.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}