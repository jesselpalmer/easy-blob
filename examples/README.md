# Runnable upload and download walkthrough

The server example hosts EasyBlob. The client example shows how an application actually uses its
HTTP API with Node's built-in `fetch`, `FormData` and `Blob`; it needs no client dependency.

## Terminal 1: start the server

Install 2.0.0 into a clean Node.js project as described in the root README, then run:

```sh
node node_modules/@jesselpalmer/easy-blob/examples/server.cjs
```

The example binds `127.0.0.1:3000`, stores bytes in `./uploads`, and stores metadata in
`./blob-storage.db`, relative to the current working directory. It has no authentication by default
and is intended for local experimentation.

## Terminal 2: upload, list, download and delete

Use an existing file of up to 10 MiB, or create a small binary sample in your application directory:

```sh
node -e "require('node:fs').writeFileSync('sample.bin', Buffer.from([0, 13, 10, 127, 128, 254, 255]), { flag: 'wx' })"
node node_modules/@jesselpalmer/easy-blob/examples/client.mjs ./sample.bin ./downloaded.bin
```

The [client source](client.mjs) performs this full lifecycle:

1. Read the local file and upload it as multipart field `blob` to `POST /upload`.
2. Read the returned numeric ID; check that `GET /files` contains that ID.
3. Download `GET /blob/:id` and verify every byte against the original.
4. Save the download to a **new** path. Existing files are never overwritten.
5. Delete **only its own upload** with `DELETE /blob/:id`, including when download verification fails.

The original and downloaded local files remain. Running again requires a new download path.
The listing can include other files, so the client never assumes ID `1` or deletes the whole list.
It buffers bytes for clarity; this is a small-file example rather than a streaming client.
Every request has a ten-second deadline, and non-success HTTP responses fail with a nonzero exit code.
If the server is unavailable during cleanup, deletion can fail; inspect the listing before retrying.
An upload whose response is lost may have succeeded, and retrying it can create a duplicate.

## Protected mounts and custom URLs

Set `PORT`, `HOST`, `STORAGE_DIR` and `DB_PATH` to change those values. Setting `EASYBLOB_TOKEN`
adds a demonstration bearer-token check and mounts all routes below `/storage`:

```sh
EASYBLOB_TOKEN=local-demo-token node node_modules/@jesselpalmer/easy-blob/examples/server.cjs
```

In the other terminal, pass both the mounted base URL and the same token to the client:

```sh
EASYBLOB_URL=http://127.0.0.1:3000/storage EASYBLOB_TOKEN=local-demo-token node node_modules/@jesselpalmer/easy-blob/examples/client.mjs ./sample.bin ./protected-download.bin
```

These inline environment assignments work in POSIX shells. In PowerShell, set the variables first:

```powershell
$env:EASYBLOB_URL = 'http://127.0.0.1:3000/storage'
$env:EASYBLOB_TOKEN = 'local-demo-token'
node node_modules/@jesselpalmer/easy-blob/examples/client.mjs ./sample.bin ./protected-download.bin
```

Set `$env:EASYBLOB_TOKEN` in the server terminal too when using PowerShell. For a standalone server,
omit the token and set `EASYBLOB_URL` to its URL without `/storage` (the default is
`http://127.0.0.1:3000`). Do not include query strings or fragments in the base URL.
The client sends the token on every request and rejects HTTP redirects.

Use your application's authentication, per-user authorization, TLS and rate limits for deployment.
The demonstration token is not an identity or tenant-permission system. Do not commit real secrets.

## Application-owned shutdown

The CLI handles SIGINT and SIGTERM and awaits resource closure. In protected mode the example also
closes external-server connections after the shutdown grace period, including clients that never
complete HTTP headers or reach storage middleware. `startExample` accepts `shutdownTimeoutMs`
(default 5000) for that grace period. The library itself does not install
signal handlers. Requiring the example does not start a server or add listeners:

```js
const { startExample } = require('@jesselpalmer/easy-blob/examples/server.cjs');

async function main() {
  const running = await startExample({ port: 0 });
  console.log(running.server.address().port);
  await running.close();
}
main().catch(console.error);
```

`npm run test:package` installs the tarball, launches the server and the actual packaged client in
separate processes, and exercises standalone and protected mounts with temporary storage. It verifies
binary bytes, cleanup, rejected credentials and refusal to overwrite a local download. See the
verification report for the results of the release.
