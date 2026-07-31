import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * /lenovo/checkin controller
 *
 * Owns persistence for the daily check-in. The 3-step wizard UI lives in
 * <LenovoCheckinForm> — this controller just collects the payload and
 * creates the lenovo_log row.
 *
 * Note: skus_sold starts empty here. It's populated incrementally by the
 * sales screen and frozen on checkout.
 */
export default class LenovoCheckinController extends Controller {
  @service store;
  @service router;
  @service lenovoSessionAuth;

  @tracked isSaving = false;
  @tracked errorMessage = '';

  #scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  @action
  async saveCheckin(formData) {
    const {
      checkinLatitude,
      checkinLongitude,
      stockPhotoUrl,
      uniformPhotoUrl,
      notes,
    } = formData;

    this.errorMessage = '';

    // Defence-in-depth — the form already enforces these, but a controller
    // should never trust its caller. If any of these are missing the brief
    // is broken either way; surface a clear message rather than silently
    // saving a partial row.
    if (!checkinLatitude || !checkinLongitude) {
      this.errorMessage = 'Location is required to check in.';
      this.#scrollToTop();
      return;
    }
    if (!stockPhotoUrl) {
      this.errorMessage = 'Please upload a photo of the stock on the shelf.';
      this.#scrollToTop();
      return;
    }
    if (!uniformPhotoUrl) {
      this.errorMessage = 'Please upload a photo of yourself in uniform.';
      this.#scrollToTop();
      return;
    }

    this.isSaving = true;
    try {
      const ba = this.lenovoSessionAuth.currentBa;
      const now = new Date();
      const isoNow = now.toISOString();
      const todayDate = isoNow.slice(0, 10);

      // Both check-in photos go into media_links so any reporting layer
      // that already understands media_links keeps working without
      // schema changes. Order is preserved: [stock, uniform].
      const mediaLinks = [stockPhotoUrl, uniformPhotoUrl];

      const record = this.store.createRecord('lenovo_log', {
        modules: {
          title: `${ba.modules.title} — ${todayDate}`,
          content_privacy: 'public',
          lenovo_ba: ba.id,
          checkin_datetime: isoNow,
          checkout_datetime: '',
          // Schema declares these lat/lng fields as strings — coerce
          // numbers explicitly so we don't accidentally persist a
          // JS-native float on one tenant and a string on another.
          checkin_latitude: String(checkinLatitude),
          checkin_longitude: String(checkinLongitude),
          checkout_latitude: '',
          checkout_longitude: '',
          // The schema types media_links/skus_sold as string. Stringify
          // here so reads in this controller (and downstream) can rely on
          // a consistent shape. JSON.parse handles both forms gracefully.
          media_links: JSON.stringify(mediaLinks),
          skus_sold: JSON.stringify([]),
          notes: notes ?? '',
        },
      });

      await record.save();
      this.router.transitionTo('lenovo.index');
    } catch {
      this.errorMessage = 'Could not save check-in. Please try again.';
      this.#scrollToTop();
    } finally {
      this.isSaving = false;
    }
  }
}
