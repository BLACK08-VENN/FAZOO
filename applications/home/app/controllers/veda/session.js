import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class VedaSessionController extends Controller {
  @service sessionAuth;
  @service store;
  @service router;

  @tracked isSaving = false;
  @tracked errorMessage = '';

  #scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  @action
  async saveSession(formData) {
    const {
      selectedSchool,
      sessionDate,
      selectedActivityTypes,
      learnerCounts,
      mediaFiles,
      kissflowConfirmed,
      notes,
      checkinLatitude,
      checkinLongitude,
      status,
      cancellationReason,
    } = formData;

    // ── Client-side validation ──────────────────────────────────────────────
    this.errorMessage = '';

    if (!kissflowConfirmed) {
      this.errorMessage =
        'Please confirm that you have filled the Kissflow Art Teacher Form.';
      this.#scrollToTop();
      return;
    }

    if (!selectedSchool || !sessionDate || selectedActivityTypes.length === 0) {
      this.errorMessage =
        'Please fill in school, date and at least one activity type.';
      this.#scrollToTop();
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (sessionDate !== today) {
      this.errorMessage = 'Session date must be today.';
      this.#scrollToTop();
      return;
    }

    // Every selected activity must have a positive learner count.
    const missing = selectedActivityTypes.find(
      (a) => !(parseInt(learnerCounts?.[a.slug], 10) >= 1),
    );
    if (missing) {
      this.errorMessage = `Please enter a learner count of at least 1 for "${missing.title}".`;
      this.#scrollToTop();
      return;
    }

    if (status?.slug === 'cancelled' && !cancellationReason?.trim()) {
      this.errorMessage = 'Please provide a reason for the cancellation.';
      this.#scrollToTop();
      return;
    }

    if (!mediaFiles || mediaFiles.length === 0) {
      this.errorMessage = 'Please upload at least one photo.';
      this.#scrollToTop();
      return;
    }

    if (!checkinLatitude || !checkinLongitude) {
      this.errorMessage = 'Location access is required to log a session.';
      this.#scrollToTop();
      return;
    }

    // ── Persist ────────────────────────────────────────────────────────────
    this.isSaving = true;
    try {
      const ba = this.sessionAuth.currentBa;
      const school = selectedSchool;
      const title = `${school.modules.title} — ${sessionDate}`;

      const cleanCounts = {};
      let total = 0;
      for (const a of selectedActivityTypes) {
        const n = parseInt(learnerCounts?.[a.slug], 10) || 0;
        cleanCounts[a.slug] = n;
        total += n;
      }

      const record = this.store.createRecord('session', {
        modules: {
          title,
          content_privacy: 'public',
          school: school.id,
          ba: ba.id,
          session_date: sessionDate,
          activity_type: selectedActivityTypes.map((a) => a.slug),
          status: status?.slug ?? 'completed',
          cancellation_reason: cancellationReason ?? '',
          learner_counts: cleanCounts,
          learner_count: total,
          checkin_latitude: checkinLatitude,
          checkin_longitude: checkinLongitude,
          media_links: mediaFiles.map((f) => f.url ?? f),
          kissflow_confirmed: kissflowConfirmed,
          notes,
        },
      });

      await record.save();
      this.router.transitionTo('veda.index');
    } catch {
      this.errorMessage = 'Could not save session. Please try again.';
      this.#scrollToTop();
    } finally {
      this.isSaving = false;
    }
  }
}