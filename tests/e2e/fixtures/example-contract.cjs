const assert = require('node:assert/strict');
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
      example = await startExample({
        port: 0,
        storageDir: path.join(location, 'uploads'),
        dbPath: path.join(location, 'metadata.db'),
        shutdownTimeoutMs: 100,
        token,
      });
      const base = 'http://127.0.0.1:' + example.server.address().port + (token ? '/storage' : '');
      if (token) {
        for (const [method, endpoint] of [
          ['POST', '/upload'],
          ['GET', '/files'],
          ['GET', '/blob/1'],
          ['DELETE', '/blob/1'],
        ]) {
          const denied = await fetch(base + endpoint, { method });
          assert.equal(denied.status, 401);
          await denied.arrayBuffer();
        }
      }
      const headers = token ? { Authorization: 'Bearer ' + token } : {};
      const form = new FormData();
      form.append('blob', new Blob(['example bytes']), 'hello.txt');
      let response = await fetch(base + '/upload', { method: 'POST', body: form, headers });
      assert.equal(response.status, 200);
      const { id } = await response.json();
      response = await fetch(base + '/files', { headers });
      assert.equal((await response.json()).length, 1);
      response = await fetch(base + '/blob/' + id, { headers });
      assert.equal(await response.text(), 'example bytes');
      response = await fetch(base + '/blob/' + id, { method: 'DELETE', headers });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      // A host-owned socket with incomplete headers never enters storage middleware.
      // Prove the packaged example also closes these connections within its grace period.
      const admitted = new Promise((resolve) =>
        example.server.once('connection', (socket) => socket.once('data', resolve))
      );
      const stalled = net.createConnection({
        host: '127.0.0.1',
        port: example.server.address().port,
      });
      stalled.on('error', () => {});
      const disconnected = new Promise((resolve) => stalled.once('close', resolve));
      await new Promise((resolve) => stalled.once('connect', resolve));
      stalled.write('GET /storage/files HTTP/1.1\r\nHost: localhost\r\n');
      await admitted;
      await Promise.all([example.close(), disconnected]);
    } finally {
      if (example) await example.close();
      fs.rmSync(location, { recursive: true, force: true });
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
