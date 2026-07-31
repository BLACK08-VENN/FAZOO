import Route from '@ember/routing/route';

/**
 * ba/sessions/new route
 *
 * Schools are no longer preloaded here — the <SessionForm> component performs
 * on-demand backend searches so we don't need to fetch all 10 000 schools up
 * front. The model is intentionally left empty.
 */
export default class BaSessionsNewRoute extends Route {
  model() {
    return {};
  }
}
