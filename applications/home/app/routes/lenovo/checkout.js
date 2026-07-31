import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo/checkout
 *
 * Resolves today's log so the controller can render the sales summary +
 * confirmation prompt. If no log exists yet we route to /lenovo/checkin;
 * if the BA has already checked out, /lenovo/index handles the messaging
 * (we still let them land here so the back-button doesn't trap them).
 */
export default class LenovoCheckoutRoute extends Route {
  @service store;
  @service router;
  @service lenovoSessionAuth;

  async model() {
    const ba = this.lenovoSessionAuth.currentBa;
    const todayDate = new Date().toISOString().slice(0, 10);

    const logs = await this.store.query('lenovo_log', {
      modules: { lenovo_ba: ba.id },
      show_public_objects_only: false,
      sort: '-id',
      page: { offset: 0, limit: 20 },
    });

    const todayLog = logs
      .slice()
      .find((l) => (l.modules?.checkin_datetime ?? '').slice(0, 10) === todayDate);

    if (!todayLog) {
      this.router.transitionTo('lenovo.checkin');
      return null;
    }

    return { ba, todayLog };
  }
}
