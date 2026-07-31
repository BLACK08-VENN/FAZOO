import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | ba/index', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:ba/index');
    assert.ok(route);
  });
});
