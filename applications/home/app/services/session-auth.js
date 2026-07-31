import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const SESSION_COOKIE = 'fazoo_session_ba_id';

export default class SessionAuthService extends Service {
  @service store;
  @service router;
  @service cookies;

  @tracked currentBa = null;
  @tracked isAuthenticated = false;

  get baId() {
    return this.currentBa?.id ?? null;
  }

  // Called from route-login.js beforeModel (and ideally application route too)
  async restore() {
    if (this.isAuthenticated) return;

    const baId = this.cookies.getCookie(SESSION_COOKIE);
    if (!baId) return;

    try {
      const ba = await this.store.findRecord('ba', baId);
      this.currentBa = ba;
      this.isAuthenticated = true;
    } catch {
      this.cookies.eraseCookie(SESSION_COOKIE);
    }
  }

  requireAuth() {
    if (!this.isAuthenticated) {
      this.router.transitionTo('login');
    }
  }

  @action
  async login(phone, password) {
    const results = await this.store.query('ba', {
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
   * Register a new BA and immediately sign them in.
   *
   * @param {object} fields
   * @param {string}  fields.name
   * @param {string}  fields.phone
   * @param {string}  fields.password
   * @param {string}  fields.email
   * @param {string}  fields.gender
   * @param {number}  fields.age
   * @param {string}  fields.city
   * @param {string}  fields.photoUrl       — uploaded photo URL (file.md.url)
   * @param {string}  fields.content_privacy  — always 'public'
   * @returns {Promise<boolean>}
   */
  @action
  async register({ name, phone, password, email, gender, age, city, photoUrl, content_privacy }) {
    try {
      const record = this.store.createRecord('ba', {
        modules: {
          title: name,
          phone,
          password,
          email,
          gender,
          age,
          city,
          cover_url: photoUrl,
          content_privacy,
        },
      });

      const ba = await record.save();
      this.currentBa       = ba;
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
    this.currentBa       = null;
    this.isAuthenticated = false;
    this.router.transitionTo('login');
  }
}