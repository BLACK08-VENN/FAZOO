import Route from '@ember/routing/route';
import * as bootstrap from 'bootstrap';
import { service } from '@ember/service';
import { later } from '@ember/runloop';
import { action } from '@ember/object';

export default class ApplicationRoute extends Route {
  @service types;

  async beforeModel() {
    await this.types.fetchAgain();
  }

  @action
  didTransition() {
    later(this, () => {
      const loading = document.querySelector('#loading');
      if (loading) loading.classList.add('d-none');
    }, 50);
  }

  @action
  willTransition() {
    const loading = document.querySelector('#loading');
    if (loading) loading.classList.remove('d-none');
  }
}
