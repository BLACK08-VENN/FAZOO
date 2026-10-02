import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// A reviewed backport is necessary until Forge publishes its patched release.
const patchHash = createHash('sha256')
  .update(readFileSync('patches/node-forge@1.4.0.patch'))
  .digest('hex');
if (patchHash !== 'b6876574a5de19521a766856b293aeae2689848c5d8dab03f93040be0a64b8b4')
  throw new Error(
    'Forge patch changed: review and retest it before updating the audit exception.',
  );
const result = spawnSync('corepack', ['pnpm', 'audit', '--json'], { encoding: 'utf8' });
let audit;
try {
  audit = JSON.parse(result.stdout);
} catch {
  throw new Error('Dependency audit could not run.');
}
if (!audit.metadata || !audit.advisories) throw new Error('Unexpected audit response.');
const unresolved = Object.values(audit.advisories).filter(
  (a) =>
    !(
      a.github_advisory_id === 'GHSA-86w9-cpqp-85rv' &&
      a.module_name === 'node-forge' &&
      a.findings.every((f) => f.version === '1.4.0')
    ),
);
if (unresolved.length) {
  console.error(
    unresolved.map((a) => `${a.severity}: ${a.module_name} ${a.github_advisory_id}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    'No unmitigated dependency advisories. Forge advisory is covered by the pinned patch and regression test.',
  );
}
