import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyAndVerify,
  destinationKey,
  inventory,
  parseArgs,
  b2Endpoint,
  assertPrivateBucket,
} from './b2-migration.mjs';

test('inventory follows nested folders and paginates beyond 100 files', async () => {
  const files = Array.from({ length: 101 }, (_, i) => ({
    id: String(i + 1),
    name: `photo-${i}.jpg`,
    metadata: { size: 3 },
  }));
  const result = await inventory({
    async list(prefix, { offset, limit }) {
      return {
        data: prefix === '' ? [{ id: null, name: 'org' }] : files.slice(offset, offset + limit),
      };
    },
  });
  assert.equal(result.length, 101);
  assert.equal(result[100].path, 'org/photo-100.jpg');
});

test('inventory fails closed on a listing error or unsafe metadata', async () => {
  await assert.rejects(inventory({ list: async () => ({ error: new Error('denied') }) }));
  await assert.rejects(
    inventory({
      list: async () => ({ data: [{ id: '1', name: 'a.jpg', metadata: { size: -1 } }] }),
    }),
  );
});

test('copy verifies destination bytes after writing and records checksum', async () => {
  let stored = null;
  let writes = 0;
  const result = await copyAndVerify(
    { path: 'org/user/photo.jpg', bytes: 3, contentType: 'image/jpeg' },
    {
      readSource: async () => Buffer.from('abc'),
      readDestination: async () => stored,
      writeNew: async (key, bytes) => {
        assert.equal(
          key,
          'daily-log-photos/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/org/user/photo.jpg',
        );
        writes += 1;
        stored = bytes;
      },
    },
  );
  assert.equal(writes, 1);
  assert.equal(result.copied, true);
  assert.equal(
    result.sha256,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('B2 endpoint validation derives the signing region and rejects credential redirects', () => {
  assert.deepEqual(b2Endpoint('https://s3.eu-central-003.backblazeb2.com/'), {
    endpoint: 'https://s3.eu-central-003.backblazeb2.com',
    region: 'eu-central-003',
  });
  for (const url of [
    'http://s3.us-west-004.backblazeb2.com',
    'https://s3.us-west-004.backblazeb2.com.evil.example',
    'https://user@s3.us-west-004.backblazeb2.com',
    'https://s3.us-west-004.backblazeb2.com/?x=1',
  ]) {
    assert.throws(() => b2Endpoint(url));
  }
});

test('B2 privacy check rejects public, shared and unknown ACLs', () => {
  const owner = { Grantee: { Type: 'CanonicalUser', ID: 'owner' }, Permission: 'FULL_CONTROL' };
  assert.doesNotThrow(() => assertPrivateBucket({ Owner: { ID: 'owner' }, Grants: [owner] }));
  for (const acl of [
    {},
    { Owner: { ID: 'owner' }, Grants: [] },
    {
      Owner: { ID: 'owner' },
      Grants: [owner, { Grantee: { Type: 'Group', URI: 'AllUsers' }, Permission: 'READ' }],
    },
  ]) {
    assert.throws(() => assertPrivateBucket(acl));
  }
});

test('changed source content receives a different B2 destination key', async () => {
  const keys = [];
  for (const text of ['abc', 'xyz']) {
    let stored = null;
    await copyAndVerify(
      { path: 'org/user/a.jpg', bytes: 3 },
      {
        readSource: async () => Buffer.from(text),
        readDestination: async () => stored,
        writeNew: async (key, bytes) => {
          keys.push(key);
          stored = bytes;
        },
      },
    );
  }
  assert.notEqual(keys[0], keys[1]);
});

test('resume re-verifies existing bytes without writing', async () => {
  const result = await copyAndVerify(
    { path: 'org/user/a.jpg', bytes: 3 },
    {
      readSource: async () => Buffer.from('abc'),
      readDestination: async () => Buffer.from('abc'),
      writeNew: async () => assert.fail('must not overwrite'),
    },
  );
  assert.equal(result.copied, false);
});

test('same-size destination collision is rejected and never overwritten', async () => {
  await assert.rejects(
    copyAndVerify(
      { path: 'org/user/a.jpg', bytes: 3 },
      {
        readSource: async () => Buffer.from('abc'),
        readDestination: async () => Buffer.from('xyz'),
        writeNew: async () => assert.fail('must not overwrite'),
      },
    ),
    /checksum mismatch/,
  );
});

test('corrupt upload is not marked verified', async () => {
  let uploaded = false;
  await assert.rejects(
    copyAndVerify(
      { path: 'org/user/a.jpg', bytes: 3 },
      {
        readSource: async () => Buffer.from('abc'),
        readDestination: async () => (uploaded ? Buffer.from('bad') : null),
        writeNew: async () => {
          uploaded = true;
        },
      },
    ),
    /checksum mismatch/,
  );
});

test('source size changes stop the copy before destination access', async () => {
  await assert.rejects(
    copyAndVerify(
      { path: 'org/user/a.jpg', bytes: 2 },
      {
        readSource: async () => Buffer.from('abc'),
        readDestination: async () => assert.fail('must stop first'),
      },
    ),
    /Source size changed/,
  );
});

test('defaults are read-only and ambiguous/destructive arguments fail', () => {
  assert.equal(parseArgs([]).copy, false);
  assert.equal(parseArgs(['--copy', '--limit', '5']).limit, 5);
  for (const args of [['--delete'], ['--limit', '0'], ['--copy', '--dry-run']]) {
    assert.throws(() => parseArgs(args));
  }
  for (const path of ['../a.jpg', '/a.jpg', 'org//a.jpg', 'org/./a.jpg']) {
    assert.throws(() => destinationKey(path));
  }
});
