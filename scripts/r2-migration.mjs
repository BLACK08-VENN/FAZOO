import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_BUCKET = 'daily-log-photos';
const MAX_PHOTO_BYTES = 32 * 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function destinationKey(path) {
  if (
    !path ||
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  ) {
    throw new Error('Invalid source path');
  }
  return `${SOURCE_BUCKET}/${path}`;
}

/** List recursively: Supabase returns virtual folders with a null object id. */
export async function inventory(storage) {
  const files = [];
  const folders = [''];
  for (let i = 0; i < folders.length; i += 1) {
    const prefix = folders[i];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !data) throw new Error('Source inventory failed');
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        destinationKey(path);
        if (!entry.id) folders.push(path);
        else if (entry.name !== '.emptyFolderPlaceholder') {
          const bytes = Number(entry.metadata?.size);
          if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_PHOTO_BYTES) {
            throw new Error(
              'Source object has invalid size or exceeds the 32 MiB migration limit',
            );
          }
          files.push({
            path,
            bytes,
            contentType: entry.metadata?.mimetype ?? 'application/octet-stream',
            updatedAt: entry.updated_at,
          });
        }
      }
      if (data.length < 100) break;
    }
  }
  return files;
}

/** Never overwrite a different object; re-read destination bytes on every run. */
export async function copyAndVerify(file, io) {
  const key = destinationKey(file.path);
  const source = await io.readSource(file.path);
  if (source.length !== file.bytes) throw new Error('Source size changed; repeat inventory');
  const digest = sha256(source);
  let destination = await io.readDestination(key);
  let copied = false;
  if (destination === null) {
    await io.writeNew(key, source, file.contentType, digest);
    copied = true;
    destination = await io.readDestination(key);
  }
  if (
    destination === null ||
    destination.length !== source.length ||
    sha256(destination) !== digest
  ) {
    throw new Error('Destination checksum mismatch; originals retained');
  }
  return {
    sourcePath: file.path,
    destinationKey: key,
    bytes: source.length,
    sha256: digest,
    copied,
    verifiedAt: new Date().toISOString(),
  };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function parseArgs(args) {
  const options = { copy: false, limit: Infinity, output: 'migration/data/r2-manifest.json' };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--copy') options.copy = true;
    else if (args[i] === '--dry-run') continue;
    else if (args[i] === '--limit') {
      options.limit = Number(args[++i]);
      if (!Number.isSafeInteger(options.limit) || options.limit < 1)
        throw new Error('Invalid --limit');
    } else if (args[i] === '--output') {
      options.output = args[++i];
      if (!options.output) throw new Error('Missing --output path');
    } else
      throw new Error(
        'Unknown argument; supported: --dry-run, --copy, --limit N, --output PATH',
      );
  }
  if (args.includes('--copy') && args.includes('--dry-run'))
    throw new Error('Choose either --copy or --dry-run');
  return options;
}

async function saveManifest(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: node --env-file=.env.r2-migration scripts/r2-migration.mjs [--dry-run | --copy] [--limit N] [--output PATH]',
    );
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  // Prevent accidentally copying another client/project into FAZOO's R2 bucket.
  const sourceUrl = required('SUPABASE_URL');
  if (new URL(sourceUrl).origin !== 'https://lcptkprosdmprizvsgsp.supabase.co') {
    throw new Error('Source URL is not the verified FAZOO Supabase project');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(sourceUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(SOURCE_BUCKET);
  const files = await inventory(storage);
  const selected = files.slice(0, options.limit);
  const manifest = {
    version: 1,
    phase: options.copy ? 'copy' : 'inventory',
    sourceProject: 'lcptkprosdmprizvsgsp',
    sourceBucket: SOURCE_BUCKET,
    createdAt: new Date().toISOString(),
    totalFiles: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    selectedFiles: selected.length,
    selectedBytes: selected.reduce((sum, f) => sum + f.bytes, 0),
    destinationBucket: null,
    status: 'inventory-only',
    verified: [],
    inventory: files,
  };
  const output = resolve(options.output);
  await saveManifest(output, manifest);
  console.log(
    JSON.stringify({
      totalFiles: manifest.totalFiles,
      totalBytes: manifest.totalBytes,
      selectedFiles: selected.length,
      mode: manifest.phase,
    }),
  );
  if (!options.copy) return;

  const accountId = required('R2_ACCOUNT_ID');
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Invalid R2_ACCOUNT_ID');
  const bucket = required('R2_BUCKET_NAME');
  const { S3Client, HeadBucketCommand, GetObjectCommand, PutObjectCommand } =
    await import('@aws-sdk/client-s3');
  const r2 = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
  });
  await r2.send(new HeadBucketCommand({ Bucket: bucket }));
  manifest.destinationBucket = bucket;
  manifest.status = 'copying';
  const io = {
    async readSource(path) {
      const { data, error } = await storage.download(path);
      if (error || !data) throw new Error('Source download failed');
      if (data.size > MAX_PHOTO_BYTES) throw new Error('Source exceeds migration size limit');
      return Buffer.from(await data.arrayBuffer());
    },
    async readDestination(key) {
      try {
        const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (Number(response.ContentLength) > MAX_PHOTO_BYTES)
          throw new Error('Destination exceeds migration size limit');
        return Buffer.from(await response.Body.transformToByteArray());
      } catch (error) {
        if (error?.name === 'NoSuchKey') return null;
        throw new Error('Destination read failed');
      }
    },
    async writeNew(key, bytes, contentType, digest) {
      // Atomic create-only write: a collision never replaces an existing object.
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          ContentMD5: createHash('md5').update(bytes).digest('base64'),
          CacheControl: 'private, no-store',
          StorageClass: 'STANDARD',
          IfNoneMatch: '*',
          Metadata: { sha256: digest },
        }),
      );
    },
  };
  try {
    for (const file of selected) {
      manifest.verified.push(await copyAndVerify(file, io));
      await saveManifest(output, manifest);
      console.log(`Verified ${manifest.verified.length}/${selected.length}`);
    }
    manifest.status = selected.length === files.length ? 'copy-verified' : 'sample-verified';
  } catch {
    manifest.status = 'failed-originals-retained';
    throw new Error(
      'Copy or verification failed. Originals retained; inspect the private manifest and retry.',
    );
  } finally {
    await saveManifest(output, manifest);
    r2.destroy();
  }
  console.log(
    'Copy verification complete. Live application still uses Supabase. No source files or database references were changed.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // SDK errors may contain request URLs. Never log raw errors or credentials.
    const safeMessage =
      error instanceof Error &&
      /^(Missing environment|Invalid |Unknown argument|Choose either|Source URL|Copy or verification)/.test(
        error.message,
      )
        ? error.message
        : 'Migration stopped. Check configuration, permissions and connectivity. Originals retained.';
    console.error(safeMessage);
    process.exitCode = 1;
  });
}
