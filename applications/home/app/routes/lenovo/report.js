import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { hash } from 'rsvp';

export default class LenovoReportRoute extends Route {
  @service store;

  async beforeModel() {}

  async model() {
    return hash({
      logs: await this.store.query('lenovo_log', {
        page: { offset: 0, limit: -1 },
      }),
      bas: await this.store.query('lenovo_ba', {
        page: { offset: 0, limit: -1 },
      }),
    });
  }
}