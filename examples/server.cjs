'use strict';

const http = require('node:http');
const express = require('express');
const { BlobStorage } = require('@jesselpalmer/easy-blob');

/**
 * Run with `node node_modules/@jesselpalmer/easy-blob/examples/server.cjs`.
 * Requiring this file does not start a server or install process listeners.
 */
async function startExample({
  port = 3000,
  host = '127.0.0.1',
  storageDir = './uploads',
  dbPath = './blob-storage.db',
  shutdownTimeoutMs = 5000,
  token,
} = {}) {
  if (token !== undefined && (typeof token !== 'string' || token.length === 0)) {
    throw new TypeError('token must be a nonempty string when supplied');
  }
  const storage = new BlobStorage({ storageDir, dbPath, shutdownTimeoutMs });
  let server;
  let closing;
  try {
    await storage.ready();
    if (token === undefined) {
      server = await storage.start(port, host);
    } else {
      const app = express();
      // Authentication runs before every storage route, including uploads.
      // Replace this demo token with your application's authentication and authorization.
      app.use(
        '/storage',
        (req, res, next) => {
          if (req.headers.authorization !== `Bearer ${token}`) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }
          next();
        },
        storage.router
      );
      server = http.createServer(app);
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          resolve();
        });
      });
    }
  } catch (error) {
    await storage.close().catch(() => {});
    throw error;
  }
  function close() {
    if (!closing) {
      // The host also owns connections that never reach storage middleware, such
      // as incomplete HTTP headers. Give the external server its own deadline.
      closing =
        token === undefined
          ? storage.close()
          : (async () => {
              const stopped = new Promise((resolve, reject) => {
                if (!server.listening) {
                  resolve();
                  return;
                }
                server.close((error) => (error ? reject(error) : resolve()));
              });
              const deadline = setTimeout(() => server.closeAllConnections(), shutdownTimeoutMs);
              try {
                const results = await Promise.allSettled([stopped, storage.close()]);
                const failure = results.find((result) => result.status === 'rejected');
                if (failure) throw failure.reason;
              } finally {
                clearTimeout(deadline);
              }
            })();
    }
    return closing;
  }
  return { storage, server, close };
}

module.exports = { startExample };

if (require.main === module) {
  startExample({
    port: process.env.PORT === undefined ? 3000 : Number(process.env.PORT),
    host: process.env.HOST || '127.0.0.1',
    storageDir: process.env.STORAGE_DIR || './uploads',
    dbPath: process.env.DB_PATH || './blob-storage.db',
    token: process.env.EASYBLOB_TOKEN,
  })
    .then(({ server, close }) => {
      const address = server.address();
      const prefix = process.env.EASYBLOB_TOKEN === undefined ? '' : '/storage';
      console.log(
        `EasyBlob example listening at http://${address.address}:${address.port}${prefix}`
      );
      const shutdown = () => {
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
        close().catch(() => {
          console.error('Example shutdown failed; inspect storage before restarting.');
          process.exitCode = 1;
        });
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(() => {
      console.error(
        'Example startup failed; check configuration, permissions and storage ownership.'
      );
      process.exitCode = 1;
    });
}
