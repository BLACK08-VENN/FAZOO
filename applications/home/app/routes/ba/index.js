import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class BaIndexRoute extends Route {
  @service sessionAuth;
  @service store;

  async model() {
    return this.store.query('session', {
      modules: { ba: this.sessionAuth.baId },
      sort: '-session_date',
      page: { offset: 0, limit: -1 },
      show_public_objects_only: false,
    });
  }
}
