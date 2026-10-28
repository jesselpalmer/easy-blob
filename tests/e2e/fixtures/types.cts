import {
  BlobStorage,
  Database,
  type BlobMetadata,
  type BlobStorageOptions,
} from '@jesselpalmer/easy-blob';
import type { Server } from 'node:http';
const options: BlobStorageOptions = { storageDir: './data', dbPath: './metadata.db' };
async function integrate() {
  const storage = new BlobStorage(options);
  await storage.ready();
  const server: Server = await storage.start(0);
  storage.expressApp.use('/health', (_req, res) => {
    res.send('ok');
  });
  const metadata: BlobMetadata[] = [];
  void server;
  void metadata;
  void Database;
  await storage.close();
}
void integrate;
