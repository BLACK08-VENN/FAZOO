import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class AdminLoginController extends Controller {
  @service adminAuth;
  @service router;

  @tracked phone = '';
  @tracked password = '';
  @tracked errorMessage = '';

  @action
  async login() {
    this.errorMessage = '';
    const ok = await this.adminAuth.login(this.phone, this.password);
    if (ok) {
      this.router.transitionTo('admin.reports');
    } else {
      this.errorMessage = 'Invalid credentials.';
    }
  }
}
