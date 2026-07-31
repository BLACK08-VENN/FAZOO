import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const SESSION_COOKIE = 'fazoo_lenovo_session_ba_id';

/**
 * lenovo-session-auth
 *
 * Mirrors session-auth (Veda) but operates on the `lenovo_ba` model and
 * uses an isolated cookie key so a Veda BA logged in elsewhere cannot
 * cross-authenticate into the Lenovo flow.
 */
export default class LenovoSessionAuthService extends Service {
  @service store;
  @service router;
  @service cookies;

  @tracked currentBa = null;
  @tracked isAuthenticated = false;

  get baId() {
    return this.currentBa?.id ?? null;
  }

  // Called from route beforeModel to rehydrate a session from the cookie.
  async restore() {
    if (this.isAuthenticated) return;

    const baId = this.cookies.getCookie(SESSION_COOKIE);
    if (!baId) return;

    try {
      const ba = await this.store.findRecord('lenovo_ba', baId);
      this.currentBa = ba;
      this.isAuthenticated = true;
    } catch {
      this.cookies.eraseCookie(SESSION_COOKIE);
    }
  }

  requireAuth() {
    if (!this.isAuthenticated) {
      this.router.transitionTo('lenovo.login');
    }
  }

  @action
  async login(phone, password) {
    const results = await this.store.query('lenovo_ba', {
      modules: { phone, password },
      show_public_objects_only: false,
      page: { offset: 0, limit: 1 },
    });

    if (results.length > 0) {
      this.currentBa = results[0];
      this.isAuthenticated = true;
      this.cookies.setCookie(SESSION_COOKIE, this.currentBa.id);
      return true;
    }
    return false;
  }

  /**
   * Register a new Lenovo BA and immediately sign them in.
   *
   * @param {object} fields
   * @param {string} fields.name
   * @param {string} fields.phone
   * @param {string} fields.password
   * @param {string} fields.photoUrl              — profile photo (cover_url)
   * @param {string} fields.identityCardUrl       — identity_card_url
   * @param {string} fields.introLetterPhotoUrl   — intro_letter_photo_url
   * @param {string} fields.content_privacy       — always 'public'
   * @returns {Promise<boolean>}
   */
  @action
  async register({
    name,
    phone,
    password,
    photoUrl,
    identityCardUrl,
    introLetterPhotoUrl,
    content_privacy,
  }) {
    try {
      const record = this.store.createRecord('lenovo_ba', {
        modules: {
          title: name,
          phone,
          password,
          cover_url: photoUrl,
          identity_card_url: identityCardUrl,
          intro_letter_photo_url: introLetterPhotoUrl,
          content_privacy,
        },
      });

      const ba = await record.save();
      this.currentBa = ba;
      this.isAuthenticated = true;
      this.cookies.setCookie(SESSION_COOKIE, ba.id);
      return true;
    } catch {
      return false;
    }
  }

  @action
  logout() {
    this.cookies.eraseCookie(SESSION_COOKIE);
    this.currentBa = null;
    this.isAuthenticated = false;
    this.router.transitionTo('lenovo.login');
  }
}
