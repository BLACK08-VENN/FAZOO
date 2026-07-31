import Component from '@glimmer/component';
import { service } from '@ember/service';

export default class Footer extends Component {
  @service router;
  @service sessionAuth;

  isActive = (routeName) => {
    return this.router.currentRouteName === routeName;
  };
}
