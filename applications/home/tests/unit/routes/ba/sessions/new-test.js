import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | ba/sessions/new', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:ba/sessions/new');
    assert.ok(route);
  });
});
