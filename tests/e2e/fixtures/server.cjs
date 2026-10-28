const { BlobStorage } = require('@jesselpalmer/easy-blob');
const { serve } = require('./consumer-host.cjs');

serve(BlobStorage).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
