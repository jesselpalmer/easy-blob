// This application lives outside the checkout and uses only the installed public API.
async function serve(BlobStorage) {
  const storage = new BlobStorage({
    storageDir: process.env.STORAGE_DIR,
    dbPath: process.env.DB_PATH,
    maxFileSize: 64,
    shutdownTimeoutMs: 500,
  });
  try {
    const server = await storage.start(0);
    // IPC asks the host application to close on all platforms, including Windows.
    // Readiness and all data operations travel through stdout and actual HTTP.
    process.once('message', (message) => {
      if (message !== 'close') throw new Error('Unexpected host control message');
      storage
        .close()
        .catch((error) => {
          console.error(error);
          process.exitCode = 1;
        })
        .finally(() => process.disconnect());
    });
    console.log(`EASYBLOB_READY http://127.0.0.1:${server.address().port}`);
  } catch (error) {
    await storage.close();
    throw error;
  }
}

module.exports = { serve };
