import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo/login
 *
 * Nested under /lenovo so it shares the parent shell template, but the
 * parent route's beforeModel detects this transition and skips its auth
 * gate, so we don't get bounced back here in a loop. If the user is
 * already authenticated when they land on login, send them home.
 */
export default class LenovoLoginRoute extends Route {
  @service lenovoSessionAuth;
  @service router;

  async beforeModel() {
    await this.lenovoSessionAuth.restore();
    if (this.lenovoSessionAuth.isAuthenticated) {
      this.router.transitionTo('lenovo.index');
    }
  }
}
