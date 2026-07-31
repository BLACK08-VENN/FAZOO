import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Service | admin-auth', function (hooks) {
  setupTest(hooks);

  // TODO: Replace this with your real tests.
  test('it exists', function (assert) {
    let service = this.owner.lookup('service:admin-auth');
    assert.ok(service);
  });
});
