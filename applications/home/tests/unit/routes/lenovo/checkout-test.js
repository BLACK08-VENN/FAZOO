import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | lenovo/checkout', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:lenovo/checkout');
    assert.ok(route);
  });
});
