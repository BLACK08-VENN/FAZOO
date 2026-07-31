import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * /lenovo/sales controller
 *
 * Lets the BA append, edit and remove sale line-items on today's log.
 * Sales are stored as a JSON array inside `skus_sold` on the log, with
 * each entry shaped:  { sku_id, sku_title, quantity }
 *
 * Editability rule from the brief: sales become read-only the moment the
 * BA checks out for the day. We surface that with `isReadOnly`.
 */
export default class LenovoSalesController extends Controller {
  @service store;
  @service router;

  // ── Form state ───────────────────────────────────────────────────────────
  @tracked selectedSku = null;
  @tracked quantity = '';
  @tracked errorMessage = '';
  @tracked isSaving = false;

  // Index of the line currently being edited; `null` means "adding a new
  // line". Tracking the index (not a clone) keeps the data flow
  // single-source-of-truth — the array on the log is authoritative.
  @tracked editingIndex = null;

  // ── Derived state ────────────────────────────────────────────────────────

  get log() {
    return this.model?.todayLog ?? null;
  }

  get isReadOnly() {
    return !!this.log?.modules?.checkout_datetime;
  }

  /**
   * Decoded sales array. The persisted form is a JSON string; reading
   * defensively means a corrupted value just resets the screen rather
   * than throwing. Returns a fresh array each time so callers can mutate
   * a copy without affecting `this.log`.
   */
  get sales() {
    const raw = this.log?.modules?.skus_sold;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed.slice() : [];
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

  get isEditing() {
    return this.editingIndex !== null;
  }

  // ── Form actions ─────────────────────────────────────────────────────────

  @action
  onSkuChange(sku) {
    this.selectedSku = sku;
  }

  @action
  onQuantityChange(event) {
    const raw = event.target.value;
    // Normalise to a non-negative integer string. Empty stays empty so
    // the input can be cleared without flicker.
    this.quantity =
      raw === '' ? '' : String(Math.max(0, parseInt(raw, 10) || 0));
  }

  @action
  startEdit(entry, index) {
    if (this.isReadOnly) return;
    // Resolve the SKU model from the catalogue so PowerSelect's
    // @selected matches the same identity as its @options. Falling back
    // to a synthetic record keeps the UI usable even if the catalogue
    // entry has since been deleted.
    const sku =
      (this.model?.skus ?? []).find((s) => s.id === entry.sku_id) ?? {
        id: entry.sku_id,
        modules: { title: entry.sku_title },
      };
    this.selectedSku = sku;
    this.quantity = String(entry.quantity ?? '');
    this.editingIndex = index;
    this.errorMessage = '';
  }

  @action
  cancelEdit() {
    this.editingIndex = null;
    this.selectedSku = null;
    this.quantity = '';
    this.errorMessage = '';
  }

  @action
  async submitSale() {
    if (this.isReadOnly) return;
    this.errorMessage = '';

    const sku = this.selectedSku;
    const qty = parseInt(this.quantity, 10);

    if (!sku) {
      this.errorMessage = 'Please pick a SKU.';
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      this.errorMessage = 'Please enter a quantity of at least 1.';
      return;
    }

    const next = this.sales;
    const entry = {
      sku_id: sku.id,
      sku_title: sku.modules?.title ?? '',
      quantity: qty,
    };

    if (this.editingIndex === null) {
      next.push(entry);
    } else {
      next[this.editingIndex] = entry;
    }

    await this._persistSales(next);
  }

  @action
  async removeSale(index) {
    if (this.isReadOnly) return;
    const next = this.sales;
    next.splice(index, 1);
    // If we were editing the row that just got removed, drop edit mode
    // so we don't leave a stale form pointing at a vanished index.
    if (this.editingIndex === index) {
      this.editingIndex = null;
      this.selectedSku = null;
      this.quantity = '';
    } else if (this.editingIndex !== null && this.editingIndex > index) {
      // Shift the editing index left so it still points at the same row.
      this.editingIndex -= 1;
    }
    await this._persistSales(next);
  }

  @action
  goHome() {
    this.router.transitionTo('lenovo.index');
  }

  @action
  goToCheckout() {
    this.router.transitionTo('lenovo.checkout');
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  async _persistSales(arr) {
    if (!this.log) return;
    this.isSaving = true;
    try {
      this.log.modules.skus_sold = JSON.stringify(arr);
      await this.log.save();

      // Reset the form on success so the user can immediately add the
      // next line. We only reset on add — keeping the just-edited values
      // visible would be confusing, so we always clear here.
      this.editingIndex = null;
      this.selectedSku = null;
      this.quantity = '';
    } catch {
      this.errorMessage = 'Could not save the sale. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
