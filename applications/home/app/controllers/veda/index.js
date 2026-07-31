import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class VedaIndexController extends Controller {
  @service sessionAuth;
  @service store;

  /**
   * Returns true when the given date string (YYYY-MM-DD or ISO) matches today.
   * Used by the `is-today` template helper registered below.
   */
  static isToday(dateValue) {
    if (!dateValue) return false;
    const sessionDate = new Date(dateValue);
    const today = new Date();
    return (
      sessionDate.getFullYear() === today.getFullYear() &&
      sessionDate.getMonth() === today.getMonth() &&
      sessionDate.getDate() === today.getDate()
    );
  }

  @action
  async deleteSession(session) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the session "${session.modules.title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await session.destroyRecord();
    } catch (err) {
      console.error('Failed to delete session:', err);
      window.alert('Something went wrong while deleting the session. Please try again.');
    }
  }
}