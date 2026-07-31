import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * /lenovo/checkout controller
 *
 * Renders the day's sales summary and asks for an explicit confirmation
 * because checking out locks the day's data — quantities, SKUs, and the
 * sales list become read-only after this point.
 *
 * On confirm we capture geolocation fresh (not the stored check-in coords
 * — checkout location is its own datapoint), stamp checkout_datetime,
 * and route home.
 */
export default class LenovoCheckoutController extends Controller {
  @service router;

  @tracked confirmed = false;
  @tracked isSaving = false;
  @tracked errorMessage = '';

  // Geolocation can be slow or denied — track the request lifecycle so the
  // UI can show a spinner instead of just freezing.
  @tracked isLocating = false;

  #scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Derived state ────────────────────────────────────────────────────────

  get log() {
    return this.model?.todayLog ?? null;
  }

  get hasCheckedOut() {
    return !!this.log?.modules?.checkout_datetime;
  }

  /** Sales decoded from the JSON-string field — same defensive parse as
   *  elsewhere so a corrupted value never blocks checkout. */
  get sales() {
    const raw = this.log?.modules?.skus_sold;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  get totalUnits() {
    return this.sales.reduce(
      (sum, s) => sum + (parseInt(s.quantity, 10) || 0),
      0,
    );
  }

  get totalLineItems() {
    return this.sales.length;
  }

  /** Aggregated by SKU — the brief asks for "SKUs and total quantities",
   *  so we collapse duplicate lines for the same SKU into one row. */
  get aggregatedByLineItem() {
    const map = new Map();
    for (const s of this.sales) {
      const key = s.sku_id;
      const prev = map.get(key);
      const qty = parseInt(s.quantity, 10) || 0;
      if (prev) {
        prev.quantity += qty;
      } else {
        map.set(key, {
          sku_id: s.sku_id,
          sku_title: s.sku_title,
          quantity: qty,
        });
      }
    }
    return Array.from(map.values());
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  @action
  toggleConfirmed(event) {
    this.confirmed = event.target.checked;
  }

  @action
  goBack() {
    this.router.transitionTo('lenovo.index');
  }

  @action
  goToSales() {
    this.router.transitionTo('lenovo.sales');
  }

  @action
  async checkout() {
    this.errorMessage = '';

    if (!this.confirmed) {
      this.errorMessage =
        'Please confirm you understand today\'s sales cannot be edited after checkout.';
      this.#scrollToTop();
      return;
    }
    if (!this.log) return;
    if (this.hasCheckedOut) {
      // Defensive: shouldn't be reachable, but if it is, just go home.
      this.router.transitionTo('lenovo.index');
      return;
    }

    let coords;
    try {
      coords = await this._captureLocation();
    } catch (err) {
      this.errorMessage =
        err?.message ??
        'Could not get your location. Please enable location access and try again.';
      this.#scrollToTop();
      return;
    }

    this.isSaving = true;
    try {
      const isoNow = new Date().toISOString();
      this.log.modules.checkout_datetime = isoNow;
      this.log.modules.checkout_latitude = String(coords.latitude);
      this.log.modules.checkout_longitude = String(coords.longitude);

      await this.log.save();
      this.router.transitionTo('lenovo.index');
    } catch {
      this.errorMessage = 'Could not save checkout. Please try again.';
      this.#scrollToTop();
    } finally {
      this.isSaving = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Promisified geolocation. We resolve with {latitude, longitude} and
  // reject with a human-readable error so the caller can just await it.
  _captureLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported on this device.'));
        return;
      }
      this.isLocating = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.isLocating = false;
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => {
          this.isLocating = false;
          reject(
            new Error(
              err.code === err.PERMISSION_DENIED
                ? 'Location permission was denied. Please enable it in your browser to check out.'
                : 'Could not get your location. Please try again.',
            ),
          );
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  }
}
