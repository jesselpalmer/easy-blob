// Run against examples/server.cjs; this client needs only Node's built-in APIs.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

async function main() {
  const [filePath, downloadPath] = process.argv.slice(2);
  if (!filePath || !downloadPath || process.argv.length !== 4) {
    throw new Error('Usage: node client.mjs <file-to-upload> <new-download-path>');
  }
  const base = new URL(process.env.EASYBLOB_URL || 'http://127.0.0.1:3000');
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error('EASYBLOB_URL must be an HTTP(S) URL without credentials, query or fragment');
  }
  base.pathname = base.pathname.replace(/\/+$/, '') + '/';
  const headers = process.env.EASYBLOB_TOKEN
    ? { Authorization: `Bearer ${process.env.EASYBLOB_TOKEN}` }
    : {};

  async function request(endpoint, options = {}) {
    const response = await fetch(new URL(endpoint, base), {
      ...options,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // EasyBlob returns JSON errors. Do not assume every upstream proxy does.
      await response.body?.cancel();
      throw new Error(`${options.method || 'GET'} ${endpoint}: HTTP ${response.status}`);
    }
    return response;
  }

  // This small-file example buffers bytes for comparison (default server limit: 10 MiB).
  const original = await readFile(filePath);
  const form = new FormData();
  // Do not set Content-Type yourself: fetch supplies the multipart boundary.
  form.append(
    'blob',
    new Blob([original], { type: 'application/octet-stream' }),
    basename(filePath)
  );
  const { id } = await (await request('upload', { method: 'POST', body: form })).json();
  assert(Number.isSafeInteger(id) && id > 0, 'Upload must return a positive numeric ID');
  console.log(`Uploaded ${basename(filePath)} as blob ${id}`);

  try {
    const files = await (await request('files')).json();
    assert(
      files.some((file) => file.id === id),
      'Uploaded blob must appear in the listing'
    );
    console.log(`Listed ${files.length} file(s); found blob ${id}`);

    const downloaded = Buffer.from(await (await request(`blob/${id}`)).arrayBuffer());
    assert.deepEqual(downloaded, original, 'Downloaded bytes must match the original');
    // Never replace an existing local file, including the input file.
    await writeFile(downloadPath, downloaded, { flag: 'wx' });
    console.log(`Downloaded ${downloaded.length} matching bytes to ${downloadPath}`);
  } finally {
    // Delete only the upload created by this run, even if local verification fails.
    await (await request(`blob/${id}`, { method: 'DELETE' })).json();
    console.log(`Deleted blob ${id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
