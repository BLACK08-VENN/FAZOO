import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const SESSION_COOKIE = 'fazoo_session_admin_id';

export default class AdminAuthService extends Service {
  @service store;
  @service router;
  @service cookies;

  @tracked currentAdmin = null;
  @tracked isAuthenticated = false;

  // Call from the admin login route's beforeModel (and ideally application route too)
  async restore() {
    if (this.isAuthenticated) return; // already restored this session

    const adminId = this.cookies.getCookie(SESSION_COOKIE);
    if (!adminId) return;

    try {
      const admin = await this.store.findRecord('ba', adminId);

      // Revoke the session if the is_admin flag was removed after cookie was set
      if (!admin.modules?.is_admin) {
        this.cookies.eraseCookie(SESSION_COOKIE);
        return;
      }

      this.currentAdmin = admin;
      this.isAuthenticated = true;
    } catch {
      // Cookie is stale or record gone — clean up
      this.cookies.eraseCookie(SESSION_COOKIE);
    }
  }

  requireAuth() {
    if (!this.isAuthenticated) {
      this.router.transitionTo('admin.login');
    }
  }

  @action
  async login(phone, password) {
    const results = await this.store.query('ba', {
      modules: { phone, password },
      show_public_objects_only: false,
      page: { offset: 0, limit: 1 },
    });

    const admin = results[0];

    // Reject if no match or the matched BA is not an admin
    if (!admin || !admin.modules?.is_admin) {
      return false;
    }

    this.currentAdmin = admin;
    this.isAuthenticated = true;
    this.cookies.setCookie(SESSION_COOKIE, this.currentAdmin.id);
    return true;
  }

  @action
  logout() {
    this.cookies.eraseCookie(SESSION_COOKIE);
    this.currentAdmin = null;
    this.isAuthenticated = false;
    this.router.transitionTo('admin.login');
  }
}