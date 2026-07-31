import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * /lenovo
 *
 * Home dashboard. Resolves today's lenovo_log for the signed-in BA so the
 * landing page can show the right next action (Check In / Record Sale /
 * Check Out). Picks the most recently-updated row to be defensive against
 * accidental duplicates (we'd rather show the active log than a stale one).
 */
export default class LenovoIndexRoute extends Route {
  @service store;
  @service lenovoSessionAuth;

  async model() {
    const ba = this.lenovoSessionAuth.currentBa;
    if (!ba) {
      return { ba: null, todayLog: null };
    }

    const todayDate = new Date().toISOString().slice(0, 10);

    // Fetch all logs for this BA, then narrow to today on the client.
    // The backend stores checkin_datetime as a string; date prefix matching
    // is the safest cross-tenant filter without a custom endpoint.
    const logs = await this.store.query('lenovo_log', {
      modules: { lenovo_ba: ba.id },
      show_public_objects_only: false,
      sort: '-id',
      page: { offset: 0, limit: 50 },
    });

    const todays = logs
      .slice()
      .filter((l) => {
        const dt = l.modules?.checkin_datetime ?? '';
        return typeof dt === 'string' && dt.slice(0, 10) === todayDate;
      })
      // If there's more than one for the day, prefer the open one
      // (no checkout_datetime) so a stale closed log can't shadow a
      // new check-in. Otherwise fall back to the latest.
      .sort((a, b) => {
        const aOpen = !a.modules?.checkout_datetime ? 1 : 0;
        const bOpen = !b.modules?.checkout_datetime ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        return (b.id ?? 0) - (a.id ?? 0);
      });

    return {
      ba,
      todayLog: todays[0] ?? null,
    };
  }
}
