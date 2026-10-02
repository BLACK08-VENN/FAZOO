const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const path = require('node:path');
const expo = require.resolve('expo/package.json', { paths: [path.resolve('apps/mobile')] });
const cli = require.resolve('@expo/cli/package.json', { paths: [path.dirname(expo)] });
const forge = createRequire(cli)('node-forge');
test('patched Forge accepts valid RSA signatures and rejects extra nested digest elements', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 65537 });
  const md = forge.md.sha256.create(); md.update('FAZOO security regression');
  const digest = md.digest().getBytes();
  assert.equal(keys.publicKey.verify(digest, keys.privateKey.sign(md)), true);
  const a = forge.asn1;
  const alg = a.create(a.Class.UNIVERSAL,a.Type.SEQUENCE,true,[
    a.create(a.Class.UNIVERSAL,a.Type.OID,false,a.oidToDer(forge.pki.oids.sha256).getBytes()),
    a.create(a.Class.UNIVERSAL,a.Type.NULL,false,''),
    a.create(a.Class.UNIVERSAL,a.Type.OCTETSTRING,false,'unconsumed garbage'),
  ]);
  const info = a.create(a.Class.UNIVERSAL,a.Type.SEQUENCE,true,[alg,a.create(a.Class.UNIVERSAL,a.Type.OCTETSTRING,false,digest)]);
  const invalidSignature = keys.privateKey.sign(a.toDer(info).getBytes(),'NONE');
  assert.throws(() => keys.publicKey.verify(digest,invalidSignature), /DigestInfo/);
});

test('Expo query parsing and xcode UUID generation retain their APIs', () => {
  const router = require.resolve('expo-router/package.json', { paths: [path.resolve('apps/mobile')] });
  const query = createRequire(router)('query-string');
  assert.equal(query.parse('a=hello%20world').a, 'hello world');
  assert.equal(query.parse('a=%E0%A4%A').a, '%E0%A4%A');
  const plugins = createRequire(createRequire(cli).resolve('@expo/config-plugins/package.json'));
  const uuid = createRequire(plugins.resolve('xcode/package.json'))('uuid');
  assert.match(uuid.v4(), /^[0-9a-f-]{36}$/);
});
