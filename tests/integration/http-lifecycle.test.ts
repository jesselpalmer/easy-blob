import request from 'supertest';
import express from 'express';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BlobStorage, BlobStorageOptions } from '../../src';
import { LocalStore } from '../../src/store';

const directories: string[] = [];
const storages: BlobStorage[] = [];
const externalServers: Server[] = [];

async function options(overrides: BlobStorageOptions = {}): Promise<BlobStorageOptions> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'easyblob-lifecycle-'));
  directories.push(root);
  return {
    storageDir: path.join(root, 'files'),
    dbPath: path.join(root, 'metadata.sqlite'),
    ...overrides,
  };
}

function create(config: BlobStorageOptions): BlobStorage {
  const storage = new BlobStorage(config);
  storages.push(storage);
  return storage;
}

function address(server: Server) {
  return server.address() as AddressInfo;
}

async function listen(app: express.Application) {
  const server = http.createServer(app);
  externalServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

afterEach(async () => {
  jest.restoreAllMocks();
  const results = await Promise.allSettled(storages.splice(0).map((storage) => storage.close()));
  for (const server of externalServers.splice(0)) {
    if (server.listening)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
  }
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
  for (const result of results) if (result.status === 'rejected') throw result.reason;
});

describe('initialization and ownership', () => {
  test.each([
    { storageDir: '' },
    { dbPath: ' ' },
    { dbPath: ':memory:' },
    { storageDir: 'bad\0path' },
    { maxFileSize: 0 },
    { maxFileSize: -1 },
    { maxFileSize: 1.5 },
    { maxFileSize: Number.POSITIVE_INFINITY },
    { shutdownTimeoutMs: 0 },
    { shutdownTimeoutMs: 2147483648 },
    { allowedMimeTypes: ['not-a-mime'] },
    { allowedMimeTypes: null as unknown as string[] },
  ])('rejects invalid configuration %j before opening storage', async (invalid) => {
    const config = await options();
    expect(() => create({ ...config, ...invalid })).toThrow();
  });

  test('readiness failure rejects and HTTP returns generic 503 without uncaught exceptions', async () => {
    const config = await options();
    await writeFile(config.storageDir!, 'a file cannot be a directory');
    const storage = create(config);
    await expect(storage.ready()).rejects.toThrow();
    const response = await request(storage.expressApp).get('/files');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Storage unavailable' });
    expect(JSON.stringify(response.body)).not.toContain(config.storageDir);
    await expect(storage.close()).resolves.toBeUndefined();
  });

  test('a second owner fails without disturbing the first owner', async () => {
    const config = await options();
    const first = create(config);
    await first.ready();
    const duplicate = create(config);
    await expect(duplicate.ready()).rejects.toThrow();
    await duplicate.close();
    const upload = await request(first.expressApp)
      .post('/upload')
      .attach('blob', Buffer.from('owner survives'), 'x.txt');
    expect(upload.status).toBe(200);
    await first.close();
    const reopened = create(config);
    await reopened.ready();
    expect((await request(reopened.expressApp).get('/files')).body).toHaveLength(1);
  });

  test('repeated create/ready/close cycles release locks and allow deletion of all directories', async () => {
    const config = await options();
    for (let index = 0; index < 5; index += 1) {
      const storage = create(config);
      await storage.ready();
      await Promise.all([storage.close(), storage.close(), storage.close()]);
    }
    expect(await readdir(config.storageDir!)).toEqual(['.easyblob-store.json']);
  });
});

describe('server lifecycle', () => {
  test('start defaults to loopback and close releases the port without process handlers', async () => {
    const sigint = process.listenerCount('SIGINT');
    const sigterm = process.listenerCount('SIGTERM');
    const storage = create(await options());
    const server = await storage.start(0);
    expect(address(server).address).toBe('127.0.0.1');
    expect((await request(server).get('/files')).status).toBe(200);
    expect(process.listenerCount('SIGINT')).toBe(sigint);
    expect(process.listenerCount('SIGTERM')).toBe(sigterm);
    const port = address(server).port;
    await storage.close();
    expect(server.listening).toBe(false);
    const replacement = http.createServer();
    externalServers.push(replacement);
    await new Promise<void>((resolve, reject) => {
      replacement.once('error', reject);
      replacement.listen(port, '127.0.0.1', resolve);
    });
    await expect(storage.start(0)).rejects.toThrow();
  });

  test('port conflicts reject startup and can be retried on an available port', async () => {
    const occupied = await listen(express());
    const storage = create(await options());
    await expect(storage.start(address(occupied).port)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    const server = await storage.start(0);
    expect(server.listening).toBe(true);
    await expect(storage.start(0)).rejects.toThrow();
  });

  test.each([-1, 65536, 1.5, Number.NaN])('invalid start port %s rejects', async (port) => {
    const storage = create(await options());
    await expect(storage.start(port)).rejects.toThrow();
  });

  test('closing before initialization finishes prevents later serving', async () => {
    const storage = create(await options());
    await storage.close();
    expect((await request(storage.expressApp).get('/files')).status).toBe(503);
  });

  test('closing mounted storage keeps the host server available and rejects new storage requests', async () => {
    const storage = create(await options());
    const app = express();
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.use('/storage', storage.router);
    const server = await listen(app);
    expect((await request(server).get('/storage/files')).status).toBe(200);
    await storage.close();
    expect(server.listening).toBe(true);
    expect((await request(server).get('/health')).body).toEqual({ ok: true });
    expect((await request(server).get('/storage/files')).status).toBe(503);
  });

  test.each(['owned', 'mounted'])(
    'close cancels a stalled %s upload even before its first file part',
    async (mode) => {
      const storage = create(await options({ shutdownTimeoutMs: 30 }));
      await storage.ready();
      let server: Server;
      if (mode === 'owned') server = await storage.start(0);
      else {
        const app = express();
        app.use(storage.router);
        server = await listen(app);
      }
      const admitted = new Promise<void>((resolve) => server.once('request', () => resolve()));
      const client = http.request({
        hostname: '127.0.0.1',
        port: address(server).port,
        path: '/upload',
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=stalled',
          'transfer-encoding': 'chunked',
        },
      });
      const disconnected = new Promise<void>((resolve) => {
        client.once('error', () => resolve());
        client.once('close', () => resolve());
      });
      client.flushHeaders();
      await admitted;
      const closing = storage.close();
      if (mode === 'mounted') expect((await request(server).get('/files')).status).toBe(503);
      await closing;
      await disconnected;
      if (mode === 'mounted') expect(server.listening).toBe(true);
    }
  );

  test('client-cancelled download releases its read lease and permits deletion', async () => {
    const storage = create(await options());
    const server = await storage.start(0);
    const uploaded = await request(server)
      .post('/upload')
      .attach('blob', Buffer.alloc(8 * 1024 * 1024, 17), 'large.bin');
    expect(uploaded.status).toBe(200);
    await new Promise<void>((resolve, reject) => {
      const client = http.get(
        { hostname: '127.0.0.1', port: address(server).port, path: `/blob/${uploaded.body.id}` },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`Unexpected download status ${response.statusCode}`));
            return;
          }
          response.once('data', () => response.destroy());
          response.once('close', resolve);
          response.once('error', reject);
        }
      );
      client.once('error', reject);
    });
    expect((await request(server).delete(`/blob/${uploaded.body.id}`)).status).toBe(200);
    expect((await request(server).get('/files')).body).toEqual([]);
  });

  test('aborted multipart cancels the admitted file write and leaves no metadata or bytes', async () => {
    const config = await options({ shutdownTimeoutMs: 30 });
    const storage = create(config);
    const server = await storage.start(0);
    let notifyStarted!: () => void;
    let notifyFinished!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      notifyFinished = resolve;
    });
    const original = LocalStore.prototype.writeUpload;
    jest.spyOn(LocalStore.prototype, 'writeUpload').mockImplementation(function (
      this: LocalStore,
      ...args
    ) {
      const result = original.apply(this, args);
      notifyStarted();
      void result.then(notifyFinished, notifyFinished);
      return result;
    });
    const client = http.request({
      hostname: '127.0.0.1',
      port: address(server).port,
      path: '/upload',
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=cancelled',
        'transfer-encoding': 'chunked',
      },
    });
    client.on('error', () => undefined);
    client.write(
      '--cancelled\r\nContent-Disposition: form-data; name="blob"; filename="partial.txt"\r\nContent-Type: text/plain\r\n\r\npartial payload'
    );
    await started;
    client.destroy();
    await finished;
    await storage.close();
    expect(await readdir(config.storageDir!)).toEqual(['.easyblob-store.json']);
    const reopened = create(config);
    expect((await request(reopened.expressApp).get('/files')).body).toEqual([]);
  });
});
