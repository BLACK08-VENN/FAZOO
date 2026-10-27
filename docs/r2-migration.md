# FAZOO image migration: copy and verify

This first stage copies `daily-log-photos` into a private R2 Standard bucket.
It does **not** switch the application to R2, modify database references, delete
Supabase objects, change access policies, create a bucket, or change billing.
The 89 booklist documents are outside this migration's scope.

The live read-only inventory on 27 October 2026 found 463 photos / 1,381,306,871
bytes and 89 documents / 100,221,922 bytes. Counts may grow with new uploads.

## Configuration

Create a private bucket, for example `fazoo-media`, in Cloudflare R2. Keep public
access and public custom domains disabled. Use Standard storage. Enable R2 in
the Cloudflare dashboard first if needed; this script cannot accept billing.

Create an R2 S3 API credential with object read/write access restricted to that
bucket. The Cloudflare MCP browser sign-in is not an S3 credential. Store the
following only in `.env.r2-migration` in the repository root (gitignored).
Do not paste real credentials in chat, commit them, or use `NEXT_PUBLIC_` names.

```dotenv
SUPABASE_URL=https://lcptkprosdmprizvsgsp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-locally
R2_ACCOUNT_ID=replace-locally
R2_BUCKET_NAME=fazoo-media
R2_ACCESS_KEY_ID=replace-locally
R2_SECRET_ACCESS_KEY=replace-locally
```

Use Node >=22.13 and `pnpm install --frozen-lockfile`. Restrict local permissions:

```bash
chmod 600 .env.r2-migration
```

## Read-only inventory

```bash
node --env-file=.env.r2-migration scripts/r2-migration.mjs --dry-run
```

This lists every source folder with pagination. It writes a private manifest
under the already gitignored `migration/data/` directory. No R2 credentials are
needed for inventory. Keep manifests private: object paths contain identifiers.

## Copy a five-image sample, then all photos

```bash
node --env-file=.env.r2-migration scripts/r2-migration.mjs --copy --limit 5 --output migration/data/r2-sample.json
node --env-file=.env.r2-migration scripts/r2-migration.mjs --copy
```

Run one migration at a time. Each destination key is
`daily-log-photos/<original-path>`. The script preserves original bytes and
content types. It uses an atomic create-only PUT and then downloads the R2 copy
to compare its SHA-256 and byte size with the source. An existing matching object
is re-verified and skipped; an existing different object causes failure without
overwriting it. Re-running after interruption re-inventories and re-verifies all
selected objects; it does not trust old manifests or object metadata as proof.

The default 32 MiB per-file guard is larger than the existing 8 MiB photo upload
limit. Unexpected larger files stop inventory for investigation. Transfer is
sequential to limit memory, and transient R2 requests retry up to three times.
Source downloads use Supabase egress; destination verification uses R2 reads.
Usage and free allowances still need monitoring.

No source deletion operation exists in this script. A verified copy is not a
completed migration or a separate backup. Concurrent source updates require
another inventory/copy pass before cutover. Verification failures return a
nonzero exit code and retain all source data. The manifest checkpoints each
successful object, with completion status distinguishing a sample from a full run.

## Application cutover (still required)

1. Introduce server-side R2 signing, validating Supabase sessions, approved
   account status, organisation, role, and any applicable MFA requirement.
   Supabase Storage RLS does not automatically protect R2.
2. Preserve own-folder upload rules and server-derived ownership. Add request
   rate limits, permitted image MIME types and size limits. Preserve offline
   request idempotency and operation receipts.
3. Update mobile upload retries and history links, admin `PhotoFrame`, and any
   other daily-photo consumer. Keep the original database paths stable and
   resolve the provider server-side. Booklist documents stay in Supabase.
4. Test authorised and unauthorised users, cross-organisation denial, suspended
   accounts, signed-link expiration, offline retries, old and new photo viewing,
   and Vercel/Expo browser CORS with exact origins rather than `*`.
5. Deploy compatible readers before directing writes to R2. Re-run copy and
   checksum verification for any source files uploaded during the transition.
6. Verify complete manifests, keep an independent backup, and review rollback
   before separately authorising source cleanup. Copying does not free Supabase
   space. Never delete storage.objects rows directly; later cleanup must use
   the Supabase Storage API after the application no longer relies on them.

## Validation

```bash
node --test scripts/r2-migration.test.mjs
```

References:

- https://supabase.com/docs/reference/javascript/storage-from-list
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
