/** Historical regression inputs are append-only across a proposed update. */
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const manifestPath = 'test/fixtures/backups/manifest.json';
function readManifest(revision) {
  const path = execFileSync('git', ['ls-tree', '--name-only', revision, '--', manifestPath], { encoding: 'utf8' }).trim();
  if (!path) return null; // The first introduction has no historical manifest.
  return JSON.parse(execFileSync('git', ['show', `${revision}:${manifestPath}`], { encoding: 'utf8' }));
}

const base = process.env.BACKUP_BASE_SHA;
if (!base || /^0+$/.test(base)) {
  process.stdout.write('No comparison revision; fixture checksums are checked by the compatibility suite.\n');
} else {
  if (!/^[a-f0-9]{40}$/.test(base)) throw Error('Invalid backup comparison revision.');
  const output = execFileSync('git', ['diff', '--name-status', '--no-renames', base, 'HEAD', '--', 'test/fixtures/backups/*.json'], { encoding: 'utf8' });
  // New fixtures and manifest entries are allowed; existing coverage is not optional.
  const changed = output.trim().split('\n').filter(Boolean).filter((line) =>
    !line.startsWith('A\t') && line.split('\t')[1] !== manifestPath);
  const previous = readManifest(base);
  if (previous) {
    const current = readManifest('HEAD');
    if (!current) changed.push(`D\t${manifestPath}`);
    else {
      for (const [name, hash] of Object.entries(previous.files ?? {})) {
        if (current.files?.[name] !== hash) changed.push(`Changed or removed fixture checksum: ${name}`);
      }
      if (Object.hasOwn(previous, 'drive') && !isDeepStrictEqual(current.drive, previous.drive)) {
        changed.push('Changed or removed historical Drive metadata.');
      }
    }
  }
  if (changed.length) {
    process.stderr.write('Historical backup inputs cannot be changed or removed. Add a new fixture instead.\n' + changed.join('\n') + '\n');
    process.exitCode = 1;
  } else process.stdout.write('Historical backup inputs are unchanged.\n');
}
