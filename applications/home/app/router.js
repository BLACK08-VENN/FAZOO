import EmberRouter from '@ember/routing/router';
import config from 'home/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('login');

  this.route('admin', function () {
    this.route('login');
    this.route('reports');
  });
  this.route('lenovo', function () {
    this.route('index', { path: '/' });
    this.route('login');
    this.route('checkin');
    this.route('sales');
    this.route('checkout');
    this.route('report');
  });

  this.route('veda', function() {
    this.route('session');
    this.route('chatbot');
  });
});
