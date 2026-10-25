// Install the actual tarball outside the checkout. Never borrow its node_modules.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'easy-blob-package-'));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this check with npm run test:e2e or npm run check');
const run = (command, args, cwd, capture = false) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, NODE_PATH: '' },
    timeout: 180_000,
  });
const npm = (args, cwd, capture) => run(process.execPath, [npmCli, ...args], cwd, capture);

try {
  const [artifact] = JSON.parse(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root, true)
  );
  assert(artifact.files.some((file) => file.path === 'dist/index.js'));
  assert(artifact.files.some((file) => file.path === 'dist/index.d.ts'));
  assert(artifact.files.some((file) => file.path === 'examples/server.cjs'));
  for (const { path: filename } of artifact.files) {
    assert(
      /^(?:dist\/[^/]+\.(?:js|d\.ts)|examples\/(?:server\.cjs|README\.md)|docs\/[^/]+\.md|[A-Z][A-Z_.-]*\.md|LICENSE|package\.json)$/.test(
        filename
      ),
      'Unexpected packaged file: ' + filename
    );
    assert(!/\.(db|sqlite|tgz|log)$|(^|\/)\.env($|\.)/.test(filename), filename);
  }
  const consumer = path.join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, 'package.json'),
    '{"name":"easy-blob-consumer","private":true}'
  );
  npm(
    ['install', '--omit=dev', '--no-audit', '--no-fund', path.join(temporary, artifact.filename)],
    consumer
  );
  // A first install and a clean lockfile reinstall use different npm metadata paths.
  // Exercise both: native dependencies can succeed initially but fail under npm ci.
  npm(['ci', '--omit=dev', '--no-audit', '--no-fund'], consumer);
  // Fixtures are ordinary linted source files. Copy them into the installed consumer
  // so no test import can silently resolve the checkout's source or dependencies.
  cpSync(path.join(root, 'tests/e2e/fixtures'), consumer, { recursive: true });
  for (const file of ['lifecycle.cjs', 'lifecycle.mjs', 'example-contract.cjs']) {
    run(process.execPath, [path.join(consumer, file)], consumer);
  }
  run(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', consumer],
    consumer
  );
  run(process.execPath, ['--test', 'process.test.cjs'], consumer);
  console.log('Clean CJS/ESM/TypeScript consumers, examples and separate-process HTTP E2E passed.');
  console.log(
    `Artifact ${artifact.id}: ${artifact.files.length} files, ${artifact.unpackedSize} unpacked bytes; ${artifact.integrity}`
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
