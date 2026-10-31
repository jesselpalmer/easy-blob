import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdtemp, readdir, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BlobStorage, BlobStorageOptions } from '../../src';
import { LocalStore } from '../../src/store';

interface Fixture {
  root: string;
  options: BlobStorageOptions;
  storage: BlobStorage;
}

const fixtures: Fixture[] = [];

async function fixture(options: BlobStorageOptions = {}): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'easyblob-http-'));
  const configured = {
    storageDir: path.join(root, 'files'),
    dbPath: path.join(root, 'metadata.sqlite'),
    ...options,
  };
  const result = { root, options: configured, storage: new BlobStorage(configured) };
  fixtures.push(result);
  return result;
}

async function upload(storage: BlobStorage, content: Buffer, filename = 'same.txt') {
  return request(storage.expressApp)
    .post('/upload')
    .attach('blob', content, { filename, contentType: 'application/octet-stream' });
}

async function download(storage: BlobStorage, id: number) {
  return request(storage.expressApp).get(`/blob/${id}`).buffer(true);
}

afterEach(async () => {
  vi.restoreAllMocks();
  const current = fixtures.splice(0);
  const results = await Promise.allSettled(
    current.map(async ({ root, storage }) => {
      try {
        await storage.close();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    })
  );
  for (const result of results) if (result.status === 'rejected') throw result.reason;
});

describe('public storage HTTP contract', () => {
  test.each([
    ['text.txt', Buffer.from('Exact UTF-8 bytes: café ☕\n\r\n')],
    ['binary.bin', Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 256))],
    ['empty.bin', Buffer.alloc(0)],
  ])('upload, list, download and delete preserves %s bytes', async (filename, bytes) => {
    const { storage } = await fixture();
    // Deliberately do not await ready(): an immediately admitted request must wait safely.
    const created = await upload(storage, bytes, filename);
    expect(created.status).toBe(200);
    expect(created.body).toEqual({ id: expect.any(Number), message: 'File uploaded successfully' });
    const id = created.body.id;
    const listed = await request(storage.expressApp).get('/files');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual({
      id,
      original_name: filename,
      mime_type: 'application/octet-stream',
      path: expect.any(String),
      upload_timestamp: expect.any(String),
    });
    const received = await download(storage, id);
    expect(received.status).toBe(200);
    expect(received.body).toEqual(bytes);
    expect(received.headers['content-type']).toBe('application/octet-stream');
    expect(received.headers['content-disposition']).toMatch(/^attachment;/);
    expect(received.headers['x-content-type-options']).toBe('nosniff');
    const deleted = await request(storage.expressApp).delete(`/blob/${id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ message: 'File deleted successfully' });
    expect((await request(storage.expressApp).get(`/blob/${id}`)).status).toBe(404);
    expect((await request(storage.expressApp).get('/files')).body).toEqual([]);
  });

  test('successful uploads retain their IDs, metadata and exact bytes after reopening', async () => {
    const f = await fixture();
    const bytes = Buffer.from([0, 255, 128, 13, 10, 1, 2]);
    const created = await upload(f.storage, bytes, 'retained.bin');
    expect(created.status).toBe(200);
    const before = (await request(f.storage.expressApp).get('/files')).body;
    await f.storage.close();
    f.storage = new BlobStorage(f.options);
    await f.storage.ready();
    expect((await request(f.storage.expressApp).get('/files')).body).toEqual(before);
    expect((await download(f.storage, created.body.id)).body).toEqual(bytes);
    const second = await upload(f.storage, Buffer.from('next'));
    expect(second.body.id).toBeGreaterThan(created.body.id);
  });

  test('parallel uploads with identical original names never share bytes or stored names', async () => {
    const { storage } = await fixture();
    const contents = Array.from({ length: 24 }, (_, index) =>
      Buffer.from(`unique-${index}\0${'x'.repeat(index)}`)
    );
    const created = await Promise.all(contents.map((bytes) => upload(storage, bytes)));
    expect(created.map((response) => response.status)).toEqual(contents.map(() => 200));
    expect(new Set(created.map((response) => response.body.id)).size).toBe(contents.length);
    const rows = (await request(storage.expressApp).get('/files')).body;
    expect(rows).toHaveLength(contents.length);
    expect(new Set(rows.map((row: { path: string }) => row.path)).size).toBe(contents.length);
    const received = await Promise.all(
      created.map((response) => download(storage, response.body.id))
    );
    expect(received.map((response) => response.body)).toEqual(contents);
  });

  test.each(['0', '-1', '01', '1.0', '1junk', '1e0', '9007199254740992', '%20', '%2B1'])(
    'rejects noncanonical ID %s for reads and deletes',
    async (id) => {
      const { storage } = await fixture();
      const created = await upload(storage, Buffer.from('must survive'));
      expect(created.status).toBe(200);
      for (const method of ['get', 'delete'] as const) {
        const result = await request(storage.expressApp)[method](`/blob/${id}`);
        expect(result.status).toBe(400);
        expect(result.body).toEqual({ error: 'Invalid blob ID' });
      }
      expect((await download(storage, created.body.id)).body).toEqual(Buffer.from('must survive'));
    }
  );

  test.each(['%ZZ', '%E0%A4%A'])(
    'malformed URL encoding %s returns safe JSON rather than an Express stack',
    async (id) => {
      const { storage } = await fixture();
      for (const method of ['get', 'delete'] as const) {
        const response = await request(storage.expressApp)[method](`/blob/${id}`);
        expect(response.status).toBe(400);
        expect(response.headers['content-type']).toMatch(/^application\/json/);
        expect(response.body).toEqual({ error: expect.any(String) });
        expect(JSON.stringify(response.body)).not.toMatch(/URIError|stack|node_modules/);
      }
    }
  );

  test('unknown IDs return 404 for both reads and deletes', async () => {
    const { storage } = await fixture();
    expect((await request(storage.expressApp).get('/blob/123')).status).toBe(404);
    expect((await request(storage.expressApp).delete('/blob/123')).status).toBe(404);
  });

  test('rejects missing files, unexpected file fields, multiple files and text fields', async () => {
    const { storage } = await fixture();
    const app = storage.expressApp;
    const responses = [
      await request(app).post('/upload'),
      await request(app).post('/upload').attach('wrong', Buffer.from('data'), 'x.txt'),
      await request(app)
        .post('/upload')
        .attach('blob', Buffer.from('one'), 'x.txt')
        .attach('blob', Buffer.from('two'), 'x.txt'),
      await request(app)
        .post('/upload')
        .field('unexpected', 'value')
        .attach('blob', Buffer.from('data'), 'x.txt'),
      await request(app)
        .post('/upload')
        .attach('blob', Buffer.from('data'), 'x.txt')
        .field('unexpected', 'value'),
    ];
    expect(responses.map((result) => result.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await request(app).get('/files')).body).toEqual([]);
  });

  test('rejects oversized bytes and removes their partial file', async () => {
    const f = await fixture({ maxFileSize: 8 });
    const response = await upload(f.storage, Buffer.alloc(9));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'File too large' });
    expect((await request(f.storage.expressApp).get('/files')).body).toEqual([]);
    await f.storage.close();
    expect(await readdir(f.options.storageDir!)).toEqual(['.easyblob-store.json']);
  });

  test('MIME filtering checks declarations, not content signatures', async () => {
    const { storage } = await fixture({ allowedMimeTypes: ['image/png'] });
    const rejected = await request(storage.expressApp)
      .post('/upload')
      .attach('blob', Buffer.from('text'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(rejected.status).toBe(400);
    const declared = Buffer.from('not a PNG; the caller declared image/png');
    const accepted = await request(storage.expressApp)
      .post('/upload')
      .attach('blob', declared, { filename: 'x.png', contentType: 'image/png' });
    expect(accepted.status).toBe(200);
    expect((await download(storage, accepted.body.id)).body).toEqual(declared);
  });

  test('malformed multipart returns an error without preventing subsequent requests', async () => {
    const { storage } = await fixture();
    const malformed = await request(storage.expressApp)
      .post('/upload')
      .set('Content-Type', 'multipart/form-data')
      .send('missing boundary');
    expect(malformed.status).toBe(400);
    expect((await upload(storage, Buffer.from('healthy'))).status).toBe(200);
  });

  test('a physical file removed externally returns 404 rather than crashing the server', async () => {
    const f = await fixture();
    const created = await upload(f.storage, Buffer.from('external removal'));
    const rows = (await request(f.storage.expressApp).get('/files')).body;
    await unlink(path.join(f.options.storageDir!, rows[0].path));
    expect((await request(f.storage.expressApp).get(`/blob/${created.body.id}`)).status).toBe(404);
    expect((await request(f.storage.expressApp).get('/files')).status).toBe(200);
  });

  test.each(['writeUpload', 'commitUpload'] as const)(
    'a %s failure returns a generic 500 and cleans incomplete files',
    async (operation) => {
      const f = await fixture();
      await f.storage.ready();
      vi.spyOn(LocalStore.prototype, operation).mockRejectedValueOnce(
        new Error('sensitive local path and internal failure')
      );
      const response = await upload(f.storage, Buffer.from('must not be acknowledged'));
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Server error' });
      expect((await request(f.storage.expressApp).get('/files')).body).toEqual([]);
      await f.storage.close();
      expect(await readdir(f.options.storageDir!)).toEqual(['.easyblob-store.json']);
    }
  );

  test('download stat failure returns JSON headers and releases its read lease', async () => {
    const { storage } = await fixture();
    const created = await upload(storage, Buffer.alloc(256 * 1024, 11), 'metadata-error.bin');
    expect(created.status).toBe(200);
    const original = LocalStore.prototype.open;
    vi.spyOn(LocalStore.prototype, 'open').mockImplementationOnce(async function (
      this: LocalStore,
      ...args
    ) {
      const opened = await original.apply(this, args);
      if (opened) {
        vi.spyOn(opened.handle, 'stat').mockRejectedValueOnce(
          Object.assign(new Error('controlled stat failure'), { code: 'EIO' })
        );
      }
      return opened;
    });
    const response = await request(storage.expressApp).get(`/blob/${created.body.id}`);
    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.body).toEqual({ error: 'Server error' });
    expect(response.headers['content-length']).toBe(
      String(Buffer.byteLength(JSON.stringify(response.body)))
    );
    expect((await request(storage.expressApp).delete(`/blob/${created.body.id}`)).status).toBe(200);
  });

  test('download stream failure terminates the response and releases the read lease', async () => {
    const { storage } = await fixture();
    const created = await upload(storage, Buffer.alloc(512 * 1024, 7), 'broken.bin');
    expect(created.status).toBe(200);
    const original = LocalStore.prototype.open;
    vi.spyOn(LocalStore.prototype, 'open').mockImplementationOnce(async function (
      this: LocalStore,
      ...args
    ) {
      const opened = await original.apply(this, args);
      if (opened) {
        const read = opened.handle.createReadStream.bind(opened.handle);
        vi.spyOn(opened.handle, 'createReadStream').mockImplementationOnce((options) => {
          const stream = read(options);
          stream.once('data', () => stream.destroy(new Error('controlled disk read failure')));
          return stream;
        });
      }
      return opened;
    });
    await expect(download(storage, created.body.id)).rejects.toThrow();
    // Deletion must not hang on a leaked lease, and no second response may crash the server.
    expect((await request(storage.expressApp).delete(`/blob/${created.body.id}`)).status).toBe(200);
    expect((await upload(storage, Buffer.from('still healthy'))).status).toBe(200);
  });

  test('authorization before the mounted router protects every route', async () => {
    const { storage } = await fixture();
    const app = express();
    const authenticate = vi.fn(
      (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (req.get('authorization') !== 'Bearer valid') {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        next();
      }
    );
    app.use('/storage', authenticate, storage.router);
    expect(
      (
        await request(app)
          .post('/storage/upload')
          .attach('blob', Buffer.from('unauthorized'), 'x.txt')
      ).status
    ).toBe(401);
    const created = await request(app)
      .post('/storage/upload')
      .set('Authorization', 'Bearer valid')
      .attach('blob', Buffer.from('protected'), 'x.txt');
    expect(created.status).toBe(200);
    const id = created.body.id;
    const denied = await Promise.all([
      request(app).get('/storage/files'),
      request(app).get(`/storage/blob/${id}`),
      request(app).delete(`/storage/blob/${id}`),
    ]);
    expect(denied.map((response) => response.status)).toEqual([401, 401, 401]);
    const listed = await request(app).get('/storage/files').set('Authorization', 'Bearer valid');
    expect(listed.body).toHaveLength(1);
    expect(
      (await request(app).get(`/storage/blob/${id}`).set('Authorization', 'Bearer valid')).status
    ).toBe(200);
    expect(
      (await request(app).delete(`/storage/blob/${id}`).set('Authorization', 'Bearer valid')).status
    ).toBe(200);
    expect(authenticate).toHaveBeenCalledTimes(8);
  });

  test('concurrent deletes have one success and subsequent not-found results', async () => {
    const { storage } = await fixture();
    const created = await upload(storage, Buffer.from('delete once'));
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(storage.expressApp).delete(`/blob/${created.body.id}`)
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404, 404, 404, 404, 404, 404, 404,
    ]);
    expect((await request(storage.expressApp).get('/files')).body).toEqual([]);
  });

  test('concurrent reads and deletion return either exact bytes or not-found', async () => {
    const { storage } = await fixture();
    const bytes = Buffer.alloc(256 * 1024, 0xa5);
    const created = await upload(storage, bytes, 'race.bin');
    const responses = await Promise.all([
      ...Array.from({ length: 8 }, () => download(storage, created.body.id)),
      request(storage.expressApp).delete(`/blob/${created.body.id}`),
    ]);
    expect(responses.at(-1)!.status).toBe(200);
    for (const response of responses.slice(0, -1)) {
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        // Compare bytes natively: generic object matching walks 256K Buffer keys
        // per response and can exhaust the test deadline under coverage.
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body.equals(bytes)).toBe(true);
      }
    }
  });
});
