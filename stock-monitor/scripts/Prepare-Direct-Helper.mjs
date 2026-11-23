// Generate a separate receive-only key. Never print the key or provider output.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const path = fileURLToPath(new URL('../.helper.env', import.meta.url));
try {
  if (!existsSync(path)) writeFileSync(path, `HELPER_TOKEN=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  const key = /^HELPER_TOKEN=([a-f0-9]{64})\r?$/m.exec(readFileSync(path, 'utf8'))?.[1];
  if (!key) throw new Error('Invalid file');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'secret', 'put', 'HELPER_TOKEN', '--config', './wrangler.jsonc'], { cwd: root, input: key, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error('Secret upload not confirmed');
  console.log('Receiver-only secret configured. Pairing file: ' + path);
} catch { console.error('Helper setup not confirmed; details suppressed. No key printed.'); process.exitCode = 1; }
