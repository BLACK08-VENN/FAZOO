# FAZOO image migration: copy and verify

This first stage copies `daily-log-photos` into a private Backblaze B2 bucket.
It does **not** switch the application to B2, modify database references, delete
Supabase objects, change access policies, create a bucket, or change billing.
The 89 booklist documents are outside this migration's scope.

The live read-only inventory on 27 October 2026 found 463 photos / 1,381,306,871
bytes and 89 documents / 100,221,922 bytes. Counts may grow with new uploads.

## Configuration

Create a bucket in **B2 Cloud Storage**, for example `fazoo-media-<unique-suffix>`.
Choose **Private** (files are private), and keep it private throughout migration
and application use. Backblaze Computer Backup is a separate product. Record the
bucket name and its S3 Endpoint from the bucket overview. This script cannot
accept billing or create buckets.

Create a standard **Application Key** with **Read and Write** access restricted
to that bucket. Do not use the master application key. The script does not call
List Buckets, so listing all bucket names is unnecessary. Do not restrict the
file prefix more narrowly than `daily-log-photos/`. The key must allow bucket
ACL inspection, reading files and writing files. Store the
following only in `.env.b2-migration` in the repository root (gitignored).
Do not paste real credentials in chat, commit them, or use `NEXT_PUBLIC_` names.

```dotenv
SUPABASE_URL=https://lcptkprosdmprizvsgsp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-locally
B2_ENDPOINT=https://s3.YOUR-REGION.backblazeb2.com
B2_BUCKET_NAME=your-private-fazoo-bucket
B2_KEY_ID=replace-locally
B2_APPLICATION_KEY=replace-locally
```

Use Node >=22.13 and `pnpm install --frozen-lockfile`. Restrict local permissions:

```bash
chmod 600 .env.b2-migration
```

## Read-only inventory

```bash
node --env-file=.env.b2-migration scripts/b2-migration.mjs --dry-run
```

This lists every source folder with pagination. It writes a private manifest
under the already gitignored `migration/data/` directory. No B2 credentials are
needed for inventory. Keep manifests private: object paths contain identifiers.

## Copy a five-image sample, then all photos

```bash
node --env-file=.env.b2-migration scripts/b2-migration.mjs --copy --limit 5 --output migration/data/b2-sample.json
node --env-file=.env.b2-migration scripts/b2-migration.mjs --copy
```

Run one migration at a time. Each destination key is
`daily-log-photos/<sha256>/<original-path>`. The script preserves original bytes
and content types. It checks that the bucket ACL is owner-only before copying,
then uploads and downloads the B2 copy
to compare its SHA-256 and byte size with the source. An existing matching object
is re-verified and skipped; an existing different object causes failure without
overwriting it. B2 does not document the same atomic conditional PUT semantics
as R2, so the tool includes the full content SHA-256 in the destination key.
Changed content receives a different key; repeated content targets the same key.
Do not use a shared import namespace or run concurrent writers. B2 may retain
versions after retried PUTs; review version storage before adding lifecycle rules.
Re-running after interruption re-inventories and re-verifies all
selected objects; it does not trust old manifests or object metadata as proof.

The default 32 MiB per-file guard is larger than the existing 8 MiB photo upload
limit. Unexpected larger files stop inventory for investigation. Transfer is
sequential to limit memory, and transient B2 requests retry up to three times.
Source downloads use Supabase egress; destination verification uses B2 reads.
Usage and free allowances still need monitoring.

No source deletion operation exists in this script. A verified copy is not a
completed migration or a separate backup. Concurrent source updates require
another inventory/copy pass before cutover. Verification failures return a
nonzero exit code and retain all source data. The manifest checkpoints each
successful object, with completion status distinguishing a sample from a full run.

## Application cutover (still required)

1. Introduce server-side B2 signing, validating Supabase sessions, approved
   account status, organisation, role, and any applicable MFA requirement.
   Supabase Storage RLS does not automatically protect B2.
2. Preserve own-folder upload rules and server-derived ownership. Add request
   rate limits, permitted image MIME types and size limits. Preserve offline
   request idempotency and operation receipts.
3. Update mobile upload retries and history links, admin `PhotoFrame`, and any
   other daily-photo consumer. Keep the original database paths stable and
   resolve the provider server-side using a mapping imported from the verified
   manifest. B2 keys include the checksum and differ from the source database
   paths. Booklist documents stay in Supabase.
4. Test authorised and unauthorised users, cross-organisation denial, suspended
   accounts, signed-link expiration, offline retries, old and new photo viewing,
   and Vercel/Expo browser CORS with exact origins rather than `*`.
5. Deploy compatible readers before directing writes to B2. Re-run copy and
   checksum verification for any source files uploaded during the transition.
6. Verify complete manifests, keep an independent backup, and review rollback
   before separately authorising source cleanup. Copying does not free Supabase
   space. Never delete storage.objects rows directly; later cleanup must use
   the Supabase Storage API after the application no longer relies on them.

## Validation

```bash
node --test scripts/b2-migration.test.mjs
```

References:

- https://supabase.com/docs/reference/javascript/storage-from-list
- https://www.backblaze.com/docs/cloud-storage-s3-compatible-api
- https://www.backblaze.com/docs/cloud-storage-application-keys
- https://www.backblaze.com/apidocs/s3-get-bucket-acl
- https://www.backblaze.com/apidocs/s3-put-object
