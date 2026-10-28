import { BlobStorage, Database } from '@jesselpalmer/easy-blob';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main() {
  assert.equal(typeof Database, 'function');
  const location = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-blob-consumer-'));
  const options = {
    storageDir: path.join(location, 'uploads'),
    dbPath: path.join(location, 'metadata.db'),
  };
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
    assert.equal(
      (await response.json()).find((row) => row.id === id).original_name,
      'same-name.bin'
    );
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
