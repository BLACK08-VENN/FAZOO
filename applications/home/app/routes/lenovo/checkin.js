import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo/checkin
 *
 * Guards against double check-in: if today's log already exists, route
 * the user back home instead of letting them create a duplicate row.
 * Also loads the list of stores so the BA can pick which one they're
 * reporting at as part of the check-in.
 *
 * The actual 3-step check-in flow lives in <LenovoCheckinForm>.
 */
export default class LenovoCheckinRoute extends Route {
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

    const existing = logs
      .slice()
      .find(
        (l) => (l.modules?.checkin_datetime ?? '').slice(0, 10) === todayDate,
      );

    if (existing) {
      this.router.transitionTo('lenovo.index');
      return null;
    }

    // Stores fuel the mandatory dropdown in Step 1 of the check-in form.
    // Only fetched once we know we're actually rendering the form — no
    // point loading them just to redirect away.
    const stores = await this.store.query('lenovo_store', {
      show_public_objects_only: false,
      sort: 'modules.title',
      page: { offset: 0, limit: 200 },
    });

    return { ba, stores: stores.slice() };
  }
}
