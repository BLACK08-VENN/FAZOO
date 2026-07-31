import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo/sales
 *
 * Loads today's open log and the SKU catalogue. If there's no checkin yet
 * we send the BA to /lenovo/checkin. If they've already checked out, we
 * still load the page but the controller will render it read-only — the
 * brief mandates that sales become uneditable after checkout.
 */
export default class LenovoSalesRoute extends Route {
  @service store;
  @service router;
  @service lenovoSessionAuth;

  async model() {
    const ba = this.lenovoSessionAuth.currentBa;
    const todayDate = new Date().toISOString().slice(0, 10);

    const [logs, skus] = await Promise.all([
      this.store.query('lenovo_log', {
        modules: { lenovo_ba: ba.id },
        show_public_objects_only: false,
        sort: '-id',
        page: { offset: 0, limit: 20 },
      }),
      // The SKU catalogue is small and shared across BAs — fetch the lot
      // and let PowerSelect handle search client-side.
      this.store.query('lenovo_sku', {
        sort: 'title',
        page: { offset: 0, limit: 500 },
      }),
    ]);

    const todayLog = logs
      .slice()
      .find((l) => (l.modules?.checkin_datetime ?? '').slice(0, 10) === todayDate);

    if (!todayLog) {
      this.router.transitionTo('lenovo.checkin');
      return null;
    }

    return { ba, todayLog, skus: skus.slice() };
  }
}
