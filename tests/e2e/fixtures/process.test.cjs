const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { test } = require('node:test');

async function deadline(promise, description, ms = 10_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function environment(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'easyblob-process-'));
  const children = [];
  t.after(async () => {
    // Emergency cleanup on failed assertions; forced termination never counts as graceful close.
    try {
      await Promise.all(
        children.map(async ({ child, exited }) => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          await deadline(exited, 'emergency child cleanup');
        })
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return {
    directory,
    async runClient(base, filePath, downloadPath, token) {
      const env = { ...process.env, NODE_PATH: '', EASYBLOB_URL: base };
      delete env.EASYBLOB_TOKEN;
      if (token !== undefined) env.EASYBLOB_TOKEN = token;
      const child = spawn(
        process.execPath,
        [require.resolve('@jesselpalmer/easy-blob/examples/client.mjs'), filePath, downloadPath],
        { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => (stdout += data));
      child.stderr.on('data', (data) => (stderr += data));
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      children.push({ child, exited });
      const status = await deadline(exited, 'documented client exit', 15_000);
      return { ...status, stdout, stderr };
    },
    launch(file, { token, ipc = false, port = '0' } = {}) {
      const env = {
        ...process.env,
        NODE_PATH: '',
        PORT: port,
        HOST: '127.0.0.1',
        STORAGE_DIR: path.join(directory, 'uploads'),
        DB_PATH: path.join(directory, 'metadata.db'),
      };
      delete env.EASYBLOB_TOKEN;
      if (token !== undefined) env.EASYBLOB_TOKEN = token;
      const child = spawn(process.execPath, [file], {
        cwd: __dirname,
        env,
        stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
      });
      let stderr = '';
      let stdout = '';
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      child.stdout.on('data', (data) => {
        stdout += data;
      });
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      void exited.catch(() => {});
      children.push({ child, exited });
      const lines = createInterface({ input: child.stdout });
      const ready = new Promise((resolve) => {
        lines.on('line', (line) => {
          const match = /^(?:EASYBLOB_READY|EasyBlob example listening at) (http:\/\/\S+)$/.exec(
            line
          );
          if (match) resolve(match[1]);
        });
      });
      return {
        child,
        exited,
        async ready() {
          try {
            return await deadline(
              Promise.race([
                ready,
                exited.then((status) => {
                  throw new Error(
                    `Server exited before readiness: ${JSON.stringify(status)} ${stderr}`
                  );
                }),
              ]),
              'server readiness'
            );
          } finally {
            lines.close();
          }
        },
        async stop(signal = 'SIGTERM') {
          if (ipc) child.send('close');
          else child.kill(signal);
          const status = await deadline(exited, 'graceful server shutdown');
          assert.deepEqual(status, { code: 0, signal: null }, stderr);
          // Runtime/environment warnings can use stderr without an application failure.
          // Preserve them in the report; a failed close still fails the exit-code assertion.
          if (stderr) t.diagnostic(stderr.trim());
        },
        output: () => ({ stdout, stderr }),
      };
    },
  };
}

async function request(base, endpoint, init = {}) {
  return fetch(base + endpoint, { ...init, signal: AbortSignal.timeout(5000) });
}

async function upload(base, contents, headers = {}) {
  const body = new FormData();
  body.append('blob', new Blob([contents]), 'same-name.bin');
  const response = await request(base, '/upload', { method: 'POST', body, headers });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert(Number.isSafeInteger(result.id) && result.id > 0);
  return result.id;
}

async function download(base, id, bytes, headers = {}) {
  const response = await request(base, `/blob/${id}`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Number(response.headers.get('content-length')), bytes.length);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
}

for (const extension of ['cjs', 'mjs']) {
  test(
    `installed ${extension}: outside HTTP client, restart persistence and deletion`,
    { timeout: 30_000 },
    async (t) => {
      const env = await environment(t);
      let server = env.launch(path.join(__dirname, `server.${extension}`), { ipc: true });
      let base = await server.ready();
      const bytes = Buffer.from([0, 1, 13, 127, 128, 254, 255]);
      const other = Buffer.from('independent payload');
      const id = await upload(base, bytes);
      const second = await upload(base, other);
      assert.notEqual(id, second);
      await download(base, id, bytes);
      await download(base, second, other);
      for (const [endpoint, init, status] of [
        ['/blob/01', {}, 400],
        ['/blob/9007199254740991', {}, 404],
        ['/upload', { method: 'POST' }, 400],
      ]) {
        const response = await request(base, endpoint, init);
        assert.equal(response.status, status);
        assert.equal(typeof (await response.json()).error, 'string');
      }
      const oversized = new FormData();
      oversized.append('blob', new Blob([Buffer.alloc(65)]), 'large.bin');
      const rejected = await request(base, '/upload', { method: 'POST', body: oversized });
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).error, 'File too large');
      await server.stop();

      server = env.launch(path.join(__dirname, `server.${extension}`), { ipc: true });
      base = await server.ready();
      const listed = await request(base, '/files');
      assert.equal(listed.status, 200);
      const rows = await listed.json();
      assert.deepEqual(
        rows.map((row) => row.id).sort((a, b) => a - b),
        [id, second].sort((a, b) => a - b)
      );
      assert(rows.every((row) => row.original_name === 'same-name.bin'));
      await download(base, id, bytes);
      await download(base, second, other);
      for (const removedId of [id, second]) {
        const deleted = await request(base, `/blob/${removedId}`, { method: 'DELETE' });
        assert.equal(deleted.status, 200);
        await deleted.arrayBuffer();
        const missing = await request(base, `/blob/${removedId}`);
        assert.equal(missing.status, 404);
        await missing.arrayBuffer();
      }
      await server.stop();
      server = env.launch(path.join(__dirname, `server.${extension}`), { ipc: true });
      base = await server.ready();
      assert.deepEqual(await (await request(base, '/files')).json(), []);
      await server.stop();
    }
  );
}

const example = require.resolve('@jesselpalmer/easy-blob/examples/server.cjs');
for (const token of [undefined, 'process-test-token']) {
  test(
    `documented CLI: ${token ? 'protected mount' : 'standalone'}`,
    { timeout: 30_000 },
    async (t) => {
      const env = await environment(t);
      const server = env.launch(example, { token });
      const base = await server.ready();
      if (token) {
        for (const headers of [{}, { Authorization: 'Bearer wrong-token' }]) {
          for (const [endpoint, method] of [
            ['/upload', 'POST'],
            ['/files', 'GET'],
            ['/blob/1', 'GET'],
            ['/blob/1', 'DELETE'],
          ]) {
            const denied = await request(base, endpoint, { method, headers });
            assert.equal(denied.status, 401);
            await denied.arrayBuffer();
          }
        }
      }
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      // Execute the shipped client in its own process, exactly as documented.
      // Use a real binary file and paths containing spaces; never assume blob ID 1.
      const original = Buffer.from([0, 13, 10, 127, 128, 254, 255]);
      const input = path.join(env.directory, 'input file.bin');
      const output = path.join(env.directory, 'downloaded file.bin');
      await writeFile(input, original);
      const client = await env.runClient(base, input, output, token);
      assert.equal(client.code, 0, client.stderr);
      assert.equal(client.signal, null);
      assert.match(client.stdout, /Uploaded input file.bin as blob \d+/);
      assert.match(client.stdout, /Downloaded 7 matching bytes/);
      assert.match(client.stdout, /Deleted blob \d+/);
      assert.deepEqual(await readFile(output), original);
      assert.deepEqual(await (await request(base, '/files', { headers })).json(), []);
      const existingOutput = await env.runClient(base, input, output, token);
      assert.equal(existingOutput.code, 1);
      assert.match(existingOutput.stderr, /EEXIST/);
      assert.deepEqual(await readFile(input), original);
      assert.deepEqual(await readFile(output), original);
      assert.deepEqual(await (await request(base, '/files', { headers })).json(), []);
      if (token) {
        const deniedClient = await env.runClient(base, input, output, 'wrong-token');
        assert.equal(deniedClient.code, 1);
        assert.match(deniedClient.stderr, /HTTP 401/);
        assert.deepEqual(await (await request(base, '/files', { headers })).json(), []);
      }
      const bytes = Buffer.from('CLI upload bytes');
      const id = await upload(base, bytes, headers);
      await download(base, id, bytes, headers);
      const list = await request(base, '/files', { headers });
      assert.equal((await list.json()).length, 1);
      const deleted = await request(base, `/blob/${id}`, { method: 'DELETE', headers });
      assert.equal(deleted.status, 200);
      await deleted.arrayBuffer();
      // Windows forcibly terminates a process for these signals; it cannot verify a POSIX handler.
      // The separate consumer tests above verify graceful public close() on every OS.
      if (process.platform !== 'win32') await server.stop(token ? 'SIGINT' : 'SIGTERM');
      else
        t.diagnostic(
          'CLI signal handlers are POSIX-only; Windows graceful close is covered via the consumer host.'
        );
    }
  );
}

test(
  'documented CLI: invalid configuration reports failure and exits',
  { timeout: 15_000 },
  async (t) => {
    const env = await environment(t);
    const server = env.launch(example, { port: 'not-a-port' });
    assert.deepEqual(await deadline(server.exited, 'invalid CLI exit'), { code: 1, signal: null });
    assert.doesNotMatch(server.output().stdout, /listening at/);
    assert.match(server.output().stderr, /Example startup failed/);
  }
);
