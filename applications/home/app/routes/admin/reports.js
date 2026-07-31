// app/routes/admin/reports.js
import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class AdminReportsRoute extends Route {
  @service adminAuth;
  @service store;

  beforeModel() {
    this.adminAuth.requireAuth();
  }

  async model() {
    const [sessions, bas, schools] = await Promise.all([
      this.store.query('session', {
        sort: '-session_date',
        page: { offset: 0, limit: -1 },
      }),
      this.store.query('ba', {
        sort: 'title',
        page: { offset: 0, limit: -1 },
      }),
      this.store.query('school', {
        sort: 'title',
        page: { offset: 0, limit: -1 },
      }),
    ]);
    return { sessions, bas, schools };
  }
}