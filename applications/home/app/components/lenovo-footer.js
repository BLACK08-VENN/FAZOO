import Component from '@glimmer/component';
import { service } from '@ember/service';

/**
 * <LenovoFooter>
 *
 * Bottom navigation for the Lenovo BA app. Mirrors the Veda <Footer>
 * pattern but points at the Lenovo routes and `lenovo-session-auth`.
 */
export default class LenovoFooter extends Component {
  @service router;
  @service lenovoSessionAuth;

  isActive = (routeName) => {
    return this.router.currentRouteName === routeName;
  };
}
