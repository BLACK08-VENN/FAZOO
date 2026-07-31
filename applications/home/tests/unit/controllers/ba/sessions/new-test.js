import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Controller | ba/sessions/new', function (hooks) {
  setupTest(hooks);

  // TODO: Replace this with your real tests.
  test('it exists', function (assert) {
    let controller = this.owner.lookup('controller:ba/sessions/new');
    assert.ok(controller);
  });
});
