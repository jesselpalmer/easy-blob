import express, { Application, Request, Response, Router } from 'express';
import multer from 'multer';
import { Server } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { LocalStore } from './store';
import { BlobStorageOptions, normalizeOptions, parseBlobId } from './validation';

export type { BlobStorageOptions } from './validation';
export interface UploadResponse {
  id: number;
  message: string;
}
export interface ErrorResponse {
  error: string;
}

class InvalidUpload extends Error {}

function isMalformedMultipart(error: unknown): boolean {
  return (
    error instanceof Error &&
    [
      'Multipart: Boundary not found',
      'Unexpected end of form',
      'Malformed part header',
      'Unexpected end of file',
      'Malformed content type',
      'Missing Content-Type',
    ].includes(error.message)
  );
}

type Operation = (req: Request, res: Response, signal: AbortSignal) => Promise<void>;

/** Local files and SQLite metadata, owned by one instance. See docs/OPERATIONS.md. */
export class BlobStorage {
  private readonly app: Application;
  readonly router: Router;
  private readonly store: LocalStore;
  private readonly upload: multer.Multer;
  private readonly shutdownTimeoutMs: number;
  private readonly initialization: Promise<void>;
  private readonly active = new Map<AbortController, Promise<void>>();
  private server?: Server;
  private starting?: Promise<Server>;
  private closing = false;
  private closed?: Promise<void>;

  constructor(options: BlobStorageOptions = {}) {
    const config = normalizeOptions(options);
    const allowedMimeTypes = config.allowedMimeTypes;
    this.shutdownTimeoutMs = config.shutdownTimeoutMs;
    this.store = new LocalStore(config.storageDir, config.dbPath);
    this.initialization = this.store.ready();
    // The caller may await ready later; a rejected initialization must never become unhandled.
    void this.initialization.catch(() => undefined);
    const store = this.store;
    this.upload = multer({
      storage: {
        _handleFile(req, file, callback) {
          const abort = new AbortController();
          const onAbort = () => abort.abort();
          req.once('aborted', onAbort);
          if (req.aborted) abort.abort();
          store.writeUpload(file.stream, abort.signal).then(
            (result) => {
              req.off('aborted', onAbort);
              callback(null, result);
            },
            (error: Error) => {
              req.off('aborted', onAbort);
              callback(error);
            }
          );
        },
        _removeFile(_req, file, callback) {
          store.discardUpload(file.filename).then(() => callback(null), callback);
        },
      },
      limits: { fileSize: config.maxFileSize, files: 1, fields: 0, parts: 2 },
      fileFilter(_req, file, callback) {
        if (allowedMimeTypes.length && !allowedMimeTypes.includes(file.mimetype)) {
          callback(new InvalidUpload('File type not allowed'));
        } else callback(null, true);
      },
    });
    this.router = express.Router();
    this.routes();
    this.app = express();
    this.app.disable('x-powered-by');
    this.app.use(this.router);
  }

  /** Mount authentication BEFORE this app or router, never after its routes. */
  get expressApp(): Application {
    return this.app;
  }

  /** Resolves after ownership, schema validation and recovery complete. */
  ready(): Promise<void> {
    return this.initialization;
  }

  private route(operation: Operation): express.RequestHandler {
    return (req, res) => {
      if (this.closing) {
        res.status(503).json({ error: 'Storage unavailable' });
        return;
      }
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      const onClose = () => {
        if (!res.writableFinished) abort.abort();
      };
      req.once('aborted', onAbort);
      res.once('close', onClose);
      const task = (async () => {
        try {
          try {
            await this.ready();
          } catch {
            if (!res.destroyed) res.status(503).json({ error: 'Storage unavailable' });
            return;
          }
          if (abort.signal.aborted) return;
          await operation(req, res, abort.signal);
        } catch {
          if (!res.headersSent && !res.destroyed) {
            res.removeHeader('Content-Disposition');
            res.removeHeader('Content-Length');
            res.status(500).type('application/json').json({ error: 'Server error' });
          } else if (!res.destroyed) res.destroy();
        } finally {
          req.off('aborted', onAbort);
          res.off('close', onClose);
          this.active.delete(abort);
        }
      })();
      this.active.set(abort, task);
    };
  }

  private id(req: Request, res: Response): number | undefined {
    const id = parseBlobId(req.params.id);
    if (id === undefined) res.status(400).json({ error: 'Invalid blob ID' });
    return id;
  }

  private routes(): void {
    this.router.post(
      '/upload',
      this.route(async (req, res, signal) => {
        const onAbort = () => req.destroy();
        signal.addEventListener('abort', onAbort, { once: true });
        let committed = false;
        try {
          try {
            await new Promise<void>((resolve, reject) => {
              this.upload.single('blob')(req, res, (error: unknown) => {
                if (!error) resolve();
                else
                  reject(
                    error instanceof Error
                      ? error
                      : new Error('Upload middleware failed', { cause: error })
                  );
              });
            });
          } catch (error) {
            if (
              error instanceof multer.MulterError ||
              error instanceof InvalidUpload ||
              isMalformedMultipart(error)
            ) {
              if (!res.destroyed)
                res.status(400).json({
                  error:
                    error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
                      ? 'File too large'
                      : error instanceof InvalidUpload
                        ? error.message
                        : 'Invalid multipart upload',
                });
              return;
            }
            throw error;
          }
          if (signal.aborted || req.aborted) return;
          if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
          }
          const { filename, originalname, mimetype } = req.file;
          const id = await this.store.commitUpload(filename, originalname, mimetype);
          committed = true;
          if (!res.destroyed)
            res.json({ id, message: 'File uploaded successfully' } satisfies UploadResponse);
        } finally {
          signal.removeEventListener('abort', onAbort);
          if (!committed && req.file?.filename) await this.store.discardUpload(req.file.filename);
        }
      })
    );
    this.router.get(
      '/files',
      this.route(async (_req, res) => {
        res.json(await this.store.list());
      })
    );
    this.router.get(
      '/blob/:id',
      this.route(async (req, res, signal) => {
        const id = this.id(req, res);
        if (id === undefined) return;
        const opened = await this.store.open(id);
        if (!opened) {
          res.status(404).json({ error: 'Blob not found' });
          return;
        }
        try {
          const stat = await opened.handle.stat();
          res.attachment(opened.metadata.original_name);
          res.type('application/octet-stream');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', 'sandbox');
          res.setHeader('Cache-Control', 'private, no-store');
          res.setHeader('Content-Length', String(stat.size));
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          await pipeline(opened.handle.createReadStream({ autoClose: false }), res, { signal });
        } finally {
          try {
            await opened.handle.close();
          } finally {
            opened.release();
          }
        }
      })
    );
    this.router.delete(
      '/blob/:id',
      this.route(async (req, res) => {
        const id = this.id(req, res);
        if (id === undefined) return;
        const deleted = await this.store.delete(id);
        if (!deleted) {
          res.status(404).json({ error: 'Blob not found' });
          return;
        }
        res.json({ message: 'File deleted successfully' });
      })
    );
    // Express decodes route parameters before invoking our handlers. Keep decoding
    // failures inside the same quiet JSON boundary as application errors.
    this.router.use(((error, _req, res, _next) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (res.destroyed) return;
      const malformed = error instanceof URIError;
      res
        .status(malformed ? 400 : 500)
        .json({ error: malformed ? 'Invalid blob ID' : 'Server error' });
    }) as express.ErrorRequestHandler);
  }

  /** Starts an owned server on loopback by default. Never installs process handlers. */
  start(port: number, host = '127.0.0.1'): Promise<Server> {
    if (
      !Number.isInteger(port) ||
      port < 0 ||
      port > 65535 ||
      typeof host !== 'string' ||
      !host.trim()
    ) {
      return Promise.reject(new TypeError('start requires port 0..65535 and a non-empty host'));
    }
    if (this.closing) return Promise.reject(new Error('Storage is closing'));
    if (this.server || this.starting)
      return Promise.reject(new Error('Storage server already started'));
    const task = (async () => {
      await this.ready();
      if (this.closing) throw new Error('Storage is closing');
      const server = await new Promise<Server>((resolve, reject) => {
        const instance = this.app.listen(port, host);
        instance.once('error', reject);
        instance.once('listening', () => {
          instance.off('error', reject);
          resolve(instance);
        });
      });
      this.server = server;
      return server;
    })();
    this.starting = task;
    void task
      .finally(() => {
        this.starting = undefined;
      })
      .catch(() => undefined);
    return task;
  }

  /** Stops admission, drains work, cancels remaining streams, then releases storage ownership. */
  close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closing = true;
    this.closed = (async () => {
      try {
        await this.starting;
      } catch {
        /* failed startup still needs storage cleanup */
      }
      const server = this.server;
      const stopped = new Promise<void>((resolve, reject) => {
        if (!server?.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
      // Observe rejection immediately while admitted operations drain.
      void stopped.catch(() => undefined);
      const timer = setTimeout(() => {
        for (const abort of this.active.keys()) abort.abort();
        server?.closeAllConnections();
      }, this.shutdownTimeoutMs);
      try {
        await Promise.all([...this.active.values()]);
        await stopped;
      } finally {
        clearTimeout(timer);
        await this.store.close();
      }
    })();
    return this.closed;
  }
}
