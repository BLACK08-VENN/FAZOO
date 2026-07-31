import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class VedaIndexRoute extends Route {
  @service sessionAuth;
  @service store;
  @service router;

  async beforeModel() {
    await this.sessionAuth.restore();
    if (!this.sessionAuth.isAuthenticated) {
      this.router.transitionTo('login');
    }
  }

  async model() {
    const baId = this.sessionAuth.baId;
    const sessions = await this.store.query('session', {
      modules: { ba: baId },
      sort: '-session_date',
      page: { offset: 0, limit: -1 },
    });
    return { ba: this.sessionAuth.currentBa, sessions };
  }
}
