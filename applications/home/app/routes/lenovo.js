import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo
 *
 * Parent route for the Lenovo tenant. Restores the cookie-based session
 * and redirects unauthenticated users to /lenovo/login.
 *
 * The login child opts out of this gate via its own beforeModel (which
 * doesn't call requireAuth) — but we also short-circuit here when the
 * incoming transition is targeting login, so we never end up redirecting
 * from /lenovo/login back to /lenovo/login in a loop.
 */
export default class LenovoRoute extends Route {
  @service lenovoSessionAuth;

  async beforeModel(transition) {
    await this.lenovoSessionAuth.restore();
    // Don't auth-gate the login screen itself — authenticated users get
    // bounced to home from the login route's own beforeModel.
    if (transition?.to?.name === 'lenovo.login' || transition?.to?.name === 'lenovo.report') return;
    this.lenovoSessionAuth.requireAuth();
  }
}
