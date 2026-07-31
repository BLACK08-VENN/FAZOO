import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | lenovo/sales', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:lenovo/sales');
    assert.ok(route);
  });
});
