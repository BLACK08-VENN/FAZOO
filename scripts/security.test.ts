import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inspectPreparedDocument,
  safeLocalRedirect,
  MAX_PREPARED_DOCUMENT_BYTES,
} from '../apps/admin/src/lib/document-upload';
test('upload validation rejects disguised, mismatched, empty and oversized files', () => {
  assert.throws(() =>
    inspectPreparedDocument(
      'invoice.pdf',
      'application/pdf',
      Buffer.from('<script>bad</script>'),
    ),
  );
  assert.throws(() =>
    inspectPreparedDocument('invoice.pdf', 'text/html', Buffer.from('%PDF-1.7')),
  );
  assert.throws(() =>
    inspectPreparedDocument('invoice.pdf', 'application/pdf', new Uint8Array()),
  );
  assert.throws(() =>
    inspectPreparedDocument(
      'invoice.pdf',
      'application/pdf',
      new Uint8Array(MAX_PREPARED_DOCUMENT_BYTES + 1),
    ),
  );
  assert.throws(() =>
    inspectPreparedDocument('invoice.html', 'application/pdf', Buffer.from('%PDF-1.7')),
  );
  assert.equal(
    inspectPreparedDocument('invoice.pdf', 'application/pdf', Buffer.from('%PDF-1.7')).mimeType,
    'application/pdf',
  );
});
test('DOCX must be an Office container without VBA content', () => {
  const container = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml word/document.xml'),
  ]);
  assert.equal(inspectPreparedDocument('booklist.docx', '', container).extension, 'docx');
  assert.throws(() =>
    inspectPreparedDocument('booklist.docx', '', Buffer.from('PK arbitrary zip')),
  );
  assert.throws(() =>
    inspectPreparedDocument(
      'booklist.docx',
      '',
      Buffer.concat([container, Buffer.from('vbaProject.bin')]),
    ),
  );
});
test('login redirects reject external, encoded and backslash URL bypasses', () => {
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/%2f/evil.test',
    '/\\evil.test',
    '/%5cevil.test',
    '/%0aevil.test',
    '%',
  ])
    assert.equal(safeLocalRedirect(value), '/overview');
  assert.equal(safeLocalRedirect('/booklists?stage=formatted'), '/booklists?stage=formatted');
});
