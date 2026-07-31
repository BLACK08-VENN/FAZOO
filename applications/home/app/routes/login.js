import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class LoginRoute extends Route {
  @service sessionAuth;
  @service router;

  async beforeModel() {
    await this.sessionAuth.restore();
    if (this.sessionAuth.isAuthenticated) {
      this.router.transitionTo('veda.index');
    }
  }
}