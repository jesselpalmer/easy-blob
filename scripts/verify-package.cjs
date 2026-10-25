// Install the actual tarball outside the checkout. Never borrow its node_modules.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'easy-blob-package-'));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this check with npm run test:package or npm run check');
const run = (command, args, cwd, capture = false) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, NODE_PATH: '' },
    timeout: 180_000,
  });
const npm = (args, cwd, capture) => run(process.execPath, [npmCli, ...args], cwd, capture);

const lifecycle = `
async function main() {
  assert.equal(typeof Database, 'function');
  const location = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-blob-consumer-'));
  const options = { storageDir: path.join(location, 'uploads'), dbPath: path.join(location, 'metadata.db') };
  let storage;
  try {
    storage = new BlobStorage(options);
    await storage.ready();
    let server = await storage.start(0);
    let base = 'http://127.0.0.1:' + server.address().port;
    const contents = Buffer.from([0, 1, 2, 10, 13, 127, 128, 254, 255]);
    const form = new FormData();
    form.append('blob', new Blob([contents]), 'same-name.bin');
    let response = await fetch(base + '/upload', { method: 'POST', body: form });
    assert.equal(response.status, 200);
    const { id } = await response.json();
    assert(Number.isSafeInteger(id) && id > 0);
    response = await fetch(base + '/files');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).find(row => row.id === id).original_name, 'same-name.bin');
    response = await fetch(base + '/blob/' + id);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), contents);
    await storage.close();
    storage = new BlobStorage(options);
    server = await storage.start(0);
    base = 'http://127.0.0.1:' + server.address().port;
    response = await fetch(base + '/blob/' + id);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), contents);
    response = await fetch(base + '/blob/' + id, { method: 'DELETE' });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    response = await fetch(base + '/blob/' + id);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
    response = await fetch(base + '/files');
    assert.deepEqual(await response.json(), []);
    await storage.close();
    await storage.close();
  } finally {
    if (storage) await storage.close();
    fs.rmSync(location, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`;

try {
  const [artifact] = JSON.parse(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root, true)
  );
  assert(artifact.files.some((file) => file.path === 'dist/index.js'));
  assert(artifact.files.some((file) => file.path === 'dist/index.d.ts'));
  assert(artifact.files.some((file) => file.path === 'examples/server.cjs'));
  for (const { path: filename } of artifact.files) {
    assert(
      /^(dist\/[^/]+\.(js|d\.ts)|examples\/|docs\/|[A-Z][A-Z_.-]*\.md$|LICENSE$|package\.json$)/.test(
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
  const imports = {
    cjs: `const { BlobStorage, Database } = require('@jesselpalmer/easy-blob');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');`,
    mjs: `import { BlobStorage, Database } from '@jesselpalmer/easy-blob';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';`,
  };
  for (const extension of ['cjs', 'mjs']) {
    const file = path.join(consumer, 'lifecycle.' + extension);
    writeFileSync(file, imports[extension] + '\n' + lifecycle);
    run(process.execPath, [file], consumer);
  }
  for (const extension of ['cts', 'mts']) {
    writeFileSync(
      path.join(consumer, 'types.' + extension),
      `import { BlobStorage, Database, type BlobMetadata, type BlobStorageOptions } from '@jesselpalmer/easy-blob';
import type { Server } from 'node:http';
const options: BlobStorageOptions = { storageDir: './data', dbPath: './metadata.db' };
async function integrate() {
  const storage = new BlobStorage(options);
  await storage.ready();
  const server: Server = await storage.start(0);
  storage.expressApp.use('/health', (_req, res) => { res.send('ok'); });
  const metadata: BlobMetadata[] = [];
  void server; void metadata; void Database;
  await storage.close();
}
void integrate;
`
    );
  }
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      include: ['types.cts', 'types.mts'],
    })
  );
  run(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', consumer],
    consumer
  );
  const exampleCheck = path.join(consumer, 'example.cjs');
  writeFileSync(
    exampleCheck,
    `const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startExample } = require('@jesselpalmer/easy-blob/examples/server.cjs');
const net = require('node:net');
async function main() {
  for (const token of [undefined, 'example-test-token']) {
    const location = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-blob-example-'));
    let example;
    try {
      example = await startExample({ port: 0, storageDir: path.join(location, 'uploads'), dbPath: path.join(location, 'metadata.db'), shutdownTimeoutMs: 100, token });
      const base = 'http://127.0.0.1:' + example.server.address().port + (token ? '/storage' : '');
      if (token) {
        for (const [method, endpoint] of [['POST','/upload'], ['GET','/files'], ['GET','/blob/1'], ['DELETE','/blob/1']]) {
          const denied = await fetch(base + endpoint, { method });
          assert.equal(denied.status, 401);
          await denied.arrayBuffer();
        }
      }
      const headers = token ? { Authorization: 'Bearer ' + token } : {};
      const form = new FormData();
      form.append('blob', new Blob(['example bytes']), 'hello.txt');
      let response = await fetch(base + '/upload', {method:'POST', body:form, headers});
      assert.equal(response.status, 200);
      const {id} = await response.json();
      response = await fetch(base + '/files', {headers});
      assert.equal((await response.json()).length, 1);
      response = await fetch(base + '/blob/' + id, {headers});
      assert.equal(await response.text(), 'example bytes');
      response = await fetch(base + '/blob/' + id, {method:'DELETE', headers});
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      // A host-owned socket with incomplete headers never enters storage middleware.
      // Prove the packaged example also closes these connections within its grace period.
      const admitted = new Promise(resolve => example.server.once('connection', socket => socket.once('data', resolve)));
      const stalled = net.createConnection({ host: '127.0.0.1', port: example.server.address().port });
      stalled.on('error', () => {});
      const disconnected = new Promise(resolve => stalled.once('close', resolve));
      await new Promise(resolve => stalled.once('connect', resolve));
      stalled.write('GET /storage/files HTTP/1.1\\r\\nHost: localhost\\r\\n');
      await admitted;
      await Promise.all([example.close(), disconnected]);
    } finally {
      if (example) await example.close();
      fs.rmSync(location, {recursive:true, force:true});
    }
  }
}
main().catch(error => {console.error(error); process.exitCode = 1});
`
  );
  run(process.execPath, [exampleCheck], consumer);
  console.log('Packed CJS, ESM, TypeScript, persistence and documented example consumers passed.');
  console.log(
    `Artifact ${artifact.id}: ${artifact.files.length} files, ${artifact.unpackedSize} unpacked bytes; ${artifact.integrity}`
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
