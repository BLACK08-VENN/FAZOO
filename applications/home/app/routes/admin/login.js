import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class AdminLoginRoute extends Route {
  @service adminAuth;
  @service router;

  async beforeModel() {
    await this.adminAuth.restore();

    if (this.adminAuth.isAuthenticated) {
      this.router.transitionTo('admin.reports');
    }
  }
}