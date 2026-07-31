import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import ENV from 'home/config/environment';

const COOKIE_KEY = 'fazoo_lenovo_remembered_phone';

/**
 * /lenovo/login controller
 *
 * Mirrors the Veda login controller's structure but registers `lenovo_ba`
 * records and asks for the additional Lenovo-specific documents
 * (identity card + intro letter) instead of email/age/city/gender.
 *
 * The three uploads (profile photo, ID card, intro letter) each have their
 * own preview + URL state so a failed re-upload of one doesn't wipe the
 * others.
 */
export default class LenovoLoginController extends Controller {
  @service lenovoSessionAuth;
  @service router;
  @service cookies;

  // ── Shared ───────────────────────────────────────────────────────────────
  @tracked isRegistering = false;
  @tracked isBusy = false;
  @tracked errorMessage = '';
  @tracked successMessage = '';

  // ── Login fields ─────────────────────────────────────────────────────────
  @tracked phone = '';
  @tracked password = '';
  @tracked rememberMe = false;

  // ── Registration fields ──────────────────────────────────────────────────
  @tracked reg = {
    name: '',
    phone: '',
    phoneConfirm: '',
    password: '',
    photoUrl: null,
    photoName: null,
    identityCardUrl: null,
    identityCardName: null,
    introLetterPhotoUrl: null,
    introLetterPhotoName: null,
  };

  // Per-slot preview / upload state. Keyed by slot name so each upload
  // is independent — uploading the ID card never touches the photo state.
  @tracked photoPreview = null;
  @tracked identityCardPreview = null;
  @tracked introLetterPreview = null;

  @tracked uploadingSlot = null; // 'photo' | 'identityCard' | 'introLetter' | null
  @tracked uploadError = null;

  constructor() {
    super(...arguments);
    const saved = this.cookies.getCookie(COOKIE_KEY);
    if (saved) {
      this.phone = saved;
      this.rememberMe = true;
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  get phoneMismatch() {
    return (
      this.reg.phone.length > 0 &&
      this.reg.phoneConfirm.length > 0 &&
      this.reg.phone !== this.reg.phoneConfirm
    );
  }

  get isUploading() {
    return this.uploadingSlot !== null;
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  @action
  showLogin() {
    this.isRegistering = false;
    this._clearMessages();
  }

  @action
  showRegister() {
    this.isRegistering = true;
    this._clearMessages();
  }

  // ── Login ────────────────────────────────────────────────────────────────
  @action
  async login() {
    this._clearMessages();
    if (!this.phone || !this.password) {
      this.errorMessage = 'Please enter your mobile number and password.';
      return;
    }

    this.isBusy = true;
    try {
      const ok = await this.lenovoSessionAuth.login(this.phone, this.password);
      if (ok) {
        if (this.rememberMe) {
          this.cookies.setCookie(COOKIE_KEY, this.phone);
        } else {
          this.cookies.eraseCookie(COOKIE_KEY);
        }
        this.router.transitionTo('lenovo.index');
      } else {
        this.errorMessage = 'Invalid mobile number or password.';
      }
    } finally {
      this.isBusy = false;
    }
  }

  // ── Upload helpers ───────────────────────────────────────────────────────

  // Maps a slot name to (a) which preview tracked field to update, and
  // (b) which two reg.* keys hold the URL + display name. This lets the
  // file-change handler stay generic.
  _slotConfig(slot) {
    return {
      photo: {
        previewKey: 'photoPreview',
        urlKey: 'photoUrl',
        nameKey: 'photoName',
      },
      identityCard: {
        previewKey: 'identityCardPreview',
        urlKey: 'identityCardUrl',
        nameKey: 'identityCardName',
      },
      introLetter: {
        previewKey: 'introLetterPreview',
        urlKey: 'introLetterPhotoUrl',
        nameKey: 'introLetterPhotoName',
      },
    }[slot];
  }

  @action
  triggerFileInput(slot) {
    const id = {
      photo: 'lenovoPhotoInput',
      identityCard: 'lenovoIdentityCardInput',
      introLetter: 'lenovoIntroLetterInput',
    }[slot];
    if (id) document.getElementById(id)?.click();
  }

  @action
  async onFileSelected(slot, event) {
    const cfg = this._slotConfig(slot);
    if (!cfg) return;

    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    // Local preview while the upload is in flight.
    const reader = new FileReader();
    reader.onload = (e) => {
      this[cfg.previewKey] = e.target.result;
    };
    reader.readAsDataURL(file);

    this.uploadingSlot = slot;
    this.uploadError = null;
    this.reg = { ...this.reg, [cfg.urlKey]: null, [cfg.nameKey]: null };

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(ENV.TribeENV.API_URL + '/uploads.php', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (data.status === 'success') {
        const url = `${ENV.TribeENV.API_URL}/${data.file.md.url}`;
        this.reg = {
          ...this.reg,
          [cfg.urlKey]: url,
          [cfg.nameKey]: data.file.name,
        };
      } else {
        this.uploadError = data.error_message ?? 'Upload failed.';
        this[cfg.previewKey] = null;
      }
    } catch (err) {
      this.uploadError = 'Upload failed — please try again.';
      this[cfg.previewKey] = null;
    } finally {
      this.uploadingSlot = null;
    }
  }

  // ── Registration ─────────────────────────────────────────────────────────
  @action
  async register() {
    this._clearMessages();

    const r = this.reg;
    const missing = [];

    if (!r.name.trim()) missing.push('Full Name');
    if (!r.phone.trim()) missing.push('Mobile Number');
    if (!r.phoneConfirm.trim()) missing.push('Confirm Mobile');
    if (!r.password.trim()) missing.push('Password');
    if (!r.photoUrl) missing.push('Profile Photo');

    if (missing.length > 0) {
      this.errorMessage = `Please fill in: ${missing.join(', ')}.`;
      return;
    }

    if (r.phone !== r.phoneConfirm) {
      this.errorMessage = 'Mobile numbers do not match. Please double-check.';
      return;
    }

    this.isBusy = true;
    try {
      const ok = await this.lenovoSessionAuth.register({
        name: r.name.trim(),
        phone: r.phone.trim(),
        password: r.password,
        photoUrl: r.photoUrl,
        identityCardUrl: r.identityCardUrl,
        introLetterPhotoUrl: r.introLetterPhotoUrl,
        content_privacy: 'public',
      });

      if (ok) {
        this.successMessage = 'Account created! You are now signed in.';
        this.router.transitionTo('lenovo.index');
      } else {
        this.errorMessage =
          'Registration failed. That mobile number may already be registered.';
      }
    } catch (err) {
      this.errorMessage =
        err?.message ?? 'Something went wrong. Please try again.';
    } finally {
      this.isBusy = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  _clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
