import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | veda/chatbot', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:veda/chatbot');
    assert.ok(route);
  });
});
