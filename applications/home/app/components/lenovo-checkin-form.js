import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import ENV from 'home/config/environment';

/**
 * <LenovoCheckinForm>
 *
 * The 3-step daily check-in wizard for Lenovo BAs:
 *
 *   Step 1 — "I have reported"   → picks the store and captures geolocation
 *   Step 2 — Stock-on-shelf      → uploads a photo of the stock
 *   Step 3 — Uniform selfie      → uploads a photo of the BA in uniform
 *
 * Each step has a single primary action; the user can only advance once
 * its precondition (store + location, photo uploaded) is satisfied.
 *
 * Args:
 *   @stores        {Array}    — list of lenovo_store records for the dropdown
 *   @onSave        {Function} — receives the assembled form data on submit
 *   @isSaving      {boolean}  — disables Submit and shows a spinner
 *   @errorMessage  {string}   — surfaces a parent-level error
 */
export default class LenovoCheckinFormComponent extends Component {
  // ── Wizard state ─────────────────────────────────────────────────────────
  // 1-indexed to match the labels users see ("Step 1 of 3").
  @tracked step = 1;

  // ── Step 1: Store + Location ─────────────────────────────────────────────
  // The store the BA is reporting at. Mandatory — Step 1 cannot advance
  // until both this and the geo-coordinates are set.
  @tracked selectedStore = null;
  @tracked checkinLatitude = null;
  @tracked checkinLongitude = null;
  @tracked isLocating = false;
  @tracked locationError = null;

  // ── Step 2: Stock photo ──────────────────────────────────────────────────
  @tracked stockPhotoUrl = null;
  @tracked stockPhotoPreview = null;
  @tracked isUploadingStock = false;
  @tracked stockUploadError = null;

  // ── Step 3: Uniform photo ────────────────────────────────────────────────
  @tracked uniformPhotoUrl = null;
  @tracked uniformPhotoPreview = null;
  @tracked isUploadingUniform = false;
  @tracked uniformUploadError = null;

  // ── Optional notes ───────────────────────────────────────────────────────
  @tracked notes = '';

  // ── Derived gates ────────────────────────────────────────────────────────

  get hasStore() {
    return !!this.selectedStore;
  }

  get hasLocation() {
    return this.checkinLatitude != null && this.checkinLongitude != null;
  }

  get hasStockPhoto() {
    return !!this.stockPhotoUrl;
  }

  get hasUniformPhoto() {
    return !!this.uniformPhotoUrl;
  }

  /** Step 1 needs both a chosen store and captured coords. */
  get canAdvanceFromStep1() {
    return this.hasStore && this.hasLocation;
  }

  /** Step 2 needs an uploaded photo URL — a local preview alone isn't enough. */
  get canAdvanceFromStep2() {
    return this.hasStockPhoto && !this.isUploadingStock;
  }

  /** Step 3 enables the Submit button. */
  get canSubmit() {
    return (
      this.hasStore &&
      this.hasLocation &&
      this.hasStockPhoto &&
      this.hasUniformPhoto &&
      !this.isUploadingUniform
    );
  }

  // ── Step 1: Store + Location ─────────────────────────────────────────────

  @action
  onStoreChange(store) {
    this.selectedStore = store;
  }

  @action
  captureLocation() {
    if (!navigator.geolocation) {
      this.locationError = 'Geolocation is not supported on this device.';
      return;
    }
    this.locationError = null;
    this.isLocating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.checkinLatitude = pos.coords.latitude;
        this.checkinLongitude = pos.coords.longitude;
        this.isLocating = false;
      },
      (err) => {
        this.isLocating = false;
        // PERMISSION_DENIED gets a more helpful message — anything else
        // we treat as a transient failure the user can simply retry.
        this.locationError =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Please enable it in your browser settings, then try again.'
            : 'Could not get your location. Please try again.';
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // ── Photo uploads ────────────────────────────────────────────────────────

  // Generic upload handler. The wiring per slot tells us which tracked
  // fields to update so the same code path serves both step 2 and step 3.
  async _uploadPhoto(file, slot) {
    const fields = this._slotFields(slot);
    if (!fields) return;

    // Local preview while the upload is in flight.
    const reader = new FileReader();
    reader.onload = (e) => {
      this[fields.previewKey] = e.target.result;
    };
    reader.readAsDataURL(file);

    this[fields.uploadingKey] = true;
    this[fields.errorKey] = null;
    this[fields.urlKey] = null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(ENV.TribeENV.API_URL + '/uploads.php', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (data.status === 'success') {
        this[fields.urlKey] = `${ENV.TribeENV.API_URL}/${data.file.md.url}`;
      } else {
        this[fields.errorKey] = data.error_message ?? 'Upload failed.';
        this[fields.previewKey] = null;
      }
    } catch (err) {
      this[fields.errorKey] = 'Upload failed — please try again.';
      this[fields.previewKey] = null;
    } finally {
      this[fields.uploadingKey] = false;
    }
  }

  _slotFields(slot) {
    return {
      stock: {
        urlKey: 'stockPhotoUrl',
        previewKey: 'stockPhotoPreview',
        uploadingKey: 'isUploadingStock',
        errorKey: 'stockUploadError',
      },
      uniform: {
        urlKey: 'uniformPhotoUrl',
        previewKey: 'uniformPhotoPreview',
        uploadingKey: 'isUploadingUniform',
        errorKey: 'uniformUploadError',
      },
    }[slot];
  }

  @action
  triggerStockInput() {
    document.getElementById('lenovoStockPhotoInput')?.click();
  }

  @action
  triggerUniformInput() {
    document.getElementById('lenovoUniformPhotoInput')?.click();
  }

  @action
  async onStockPhotoSelected(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    await this._uploadPhoto(file, 'stock');
  }

  @action
  async onUniformPhotoSelected(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    await this._uploadPhoto(file, 'uniform');
  }

  // ── Notes ────────────────────────────────────────────────────────────────

  @action
  onNotesChange(event) {
    this.notes = event.target.value;
  }

  // ── Wizard navigation ────────────────────────────────────────────────────

  @action
  nextStep() {
    // Defence in depth — buttons are already disabled when their gate
    // isn't satisfied, but if a click slips through somehow we shouldn't
    // advance. (Equivalent to the equivalent guards in submit().)
    if (this.step === 1 && !this.canAdvanceFromStep1) return;
    if (this.step === 2 && !this.canAdvanceFromStep2) return;
    if (this.step < 3) this.step += 1;
  }

  @action
  prevStep() {
    if (this.step > 1) this.step -= 1;
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  @action
  handleSubmit() {
    if (!this.args.onSave) return;
    if (!this.canSubmit) return;

    this.args.onSave({
      storeId: this.selectedStore?.id,
      checkinLatitude: this.checkinLatitude,
      checkinLongitude: this.checkinLongitude,
      stockPhotoUrl: this.stockPhotoUrl,
      uniformPhotoUrl: this.uniformPhotoUrl,
      notes: this.notes,
    });
  }
}
