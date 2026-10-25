import { BlobStorage } from '@jesselpalmer/easy-blob';
import { serve } from './consumer-host.cjs';

serve(BlobStorage).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
