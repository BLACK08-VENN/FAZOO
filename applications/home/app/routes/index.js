import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class BaIndexRoute extends Route {
  @service sessionAuth;
  @service store;
  @service router;

  async beforeModel() {
    await this.sessionAuth.restore();
    if (!this.sessionAuth.isAuthenticated) {
      this.router.transitionTo('login');
    } else {
      this.router.transitionTo('veda.index');
    }
  }
}
