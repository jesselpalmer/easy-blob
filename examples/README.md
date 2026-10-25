# Runnable server example

Install the candidate tarball into a clean Node.js project as described in the root README, then run:

```sh
node node_modules/@jesselpalmer/easy-blob/examples/server.cjs
```

The example binds `127.0.0.1:3000`, stores bytes in `./uploads`, and stores metadata in
`./blob-storage.db`, relative to the current working directory. It has no authentication by default
and is intended for local experimentation.

Set `PORT`, `HOST`, `STORAGE_DIR` and `DB_PATH` to change those values. Setting `EASYBLOB_TOKEN`
adds a demonstration bearer-token check and mounts all routes below `/storage`:

```sh
EASYBLOB_TOKEN=local-demo-token node node_modules/@jesselpalmer/easy-blob/examples/server.cjs
curl -H 'Authorization: Bearer local-demo-token' http://127.0.0.1:3000/storage/files
```

Use your application's authentication, per-user authorization, TLS and rate limits for deployment.
The demonstration token is not an identity or tenant-permission system. Do not commit real secrets.

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

`npm run test:package` executes this actual packaged module in both local and protected modes,
using temporary storage. See the verification report for the results of a particular candidate.
