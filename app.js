const BlobStorage = require('./lib/index');

const storage = new BlobStorage({
  dbPath: './mydatabase.db',
  storageDir: './myuploads'
});

storage.start(3000);
