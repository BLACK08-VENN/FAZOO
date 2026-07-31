import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Controller | veda/index', function (hooks) {
  setupTest(hooks);

  // TODO: Replace this with your real tests.
  test('it exists', function (assert) {
    let controller = this.owner.lookup('controller:veda/index');
    assert.ok(controller);
  });
});
