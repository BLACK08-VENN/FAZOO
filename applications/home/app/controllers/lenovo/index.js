import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * /lenovo controller
 *
 * Thin home dashboard. The route hands us today's log (or null), and we
 * derive the right next-action button(s) from its state:
 *
 *   • no log              → show "Check In"
 *   • open log            → show "Record Sale" + "Check Out"
 *   • closed log          → show summary, no further actions
 */
export default class LenovoIndexController extends Controller {
  @service lenovoSessionAuth;
  @service router;

  // ── Status getters ───────────────────────────────────────────────────────

  get hasCheckedIn() {
    return !!this.model?.todayLog?.modules?.checkin_datetime;
  }

  get hasCheckedOut() {
    return !!this.model?.todayLog?.modules?.checkout_datetime;
  }

  get isActiveDay() {
    return this.hasCheckedIn && !this.hasCheckedOut;
  }

  // ── Sales summary (read-only on the dashboard) ───────────────────────────

  /**
   * Decoded sales array for today's log. We persist `skus_sold` as a JSON
   * string (the schema types it as `string`), so we parse defensively —
   * any malformed value just becomes an empty list rather than throwing.
   */
  get todaysSales() {
    const raw = this.model?.todayLog?.modules?.skus_sold;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  get totalUnitsSoldToday() {
    return this.todaysSales.reduce(
      (sum, s) => sum + (parseInt(s.quantity, 10) || 0),
      0,
    );
  }

  get totalLineItemsToday() {
    return this.todaysSales.length;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  @action
  goToCheckin() {
    this.router.transitionTo('lenovo.checkin');
  }

  @action
  goToSales() {
    this.router.transitionTo('lenovo.sales');
  }

  @action
  goToCheckout() {
    this.router.transitionTo('lenovo.checkout');
  }
}
