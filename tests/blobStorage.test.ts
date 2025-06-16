import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { BlobStorage } from '../src/blob-storage';

/**
 * Helper function to clean up test files and directories
 */
function cleanupTestFiles(paths: string[]): void {
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Test suite for BlobStorage API endpoints
 */
describe('Blob Storage API', () => {
  let storage: BlobStorage;
  let app: any;

  beforeAll(() => {
    // Create BlobStorage instance for testing
    storage = new BlobStorage({ 
      dbPath: './testdb.sqlite', 
      storageDir: './testuploads' 
    });
    app = storage.expressApp;
  });

  afterEach(() => {
    // Clean up any test-specific files created in individual tests
    cleanupTestFiles(['./testdb-small.sqlite', './testuploads-small']);
  });

  afterAll(() => {
    // Final cleanup of main test artifacts
    cleanupTestFiles(['./testdb.sqlite', './testuploads']);
  });

  describe('POST /upload', () => {
    it('should upload a file successfully', async () => {
      const response = await request(app)
        .post('/upload')
        .attach('blob', path.join(__dirname, 'testdoc.txt'));

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.message).toBe('File uploaded successfully');
      expect(typeof response.body.id).toBe('number');
    });

    it('should return error when no file is uploaded', async () => {
      const response = await request(app)
        .post('/upload');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should return error for disallowed MIME types', async () => {
      // Create storage with restricted MIME types
      const restrictedStorage = new BlobStorage({ 
        dbPath: './testdb-restricted.sqlite', 
        storageDir: './testuploads-restricted',
        allowedMimeTypes: ['image/jpeg', 'image/png']
      });

      const response = await request(restrictedStorage.expressApp)
        .post('/upload')
        .attach('blob', path.join(__dirname, 'testdoc.txt'));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not allowed');

      // Clean up
      try {
        fs.unlinkSync('./testdb-restricted.sqlite');
        fs.rmSync('./testuploads-restricted', { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should return error for files exceeding size limit', async () => {
      // Create a test file with content larger than the limit
      const largeTestFile = path.join(__dirname, 'large-test.txt');
      fs.writeFileSync(largeTestFile, 'This is content that exceeds the 10 byte limit set below');

      // Create storage with very small file size limit
      const smallStorage = new BlobStorage({ 
        dbPath: './testdb-small.sqlite', 
        storageDir: './testuploads-small',
        maxFileSize: 10 // 10 byte limit
      });

      const response = await request(smallStorage.expressApp)
        .post('/upload')
        .attach('blob', largeTestFile);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('File too large');

      // Clean up
      cleanupTestFiles(['./testdb-small.sqlite', './testuploads-small', largeTestFile]);
    });
  });

  describe('GET /files', () => {
    it('should return list of uploaded files', async () => {
      // First upload a file
      await request(app)
        .post('/upload')
        .attach('blob', path.join(__dirname, 'testdoc.txt'));

      const response = await request(app).get('/files');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      const firstFile = response.body[0];
      expect(firstFile).toHaveProperty('id');
      expect(firstFile).toHaveProperty('original_name');
      expect(firstFile).toHaveProperty('mime_type');
      expect(firstFile).toHaveProperty('upload_timestamp');
    });
  });

  describe('GET /blob/:id', () => {
    it('should retrieve an uploaded file', async () => {
      // First upload a file
      const uploadResponse = await request(app)
        .post('/upload')
        .attach('blob', path.join(__dirname, 'testdoc.txt'));
      
      const fileId = uploadResponse.body.id;
      
      // Then retrieve it
      const response = await request(app).get(`/blob/${fileId}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type'].toLowerCase()).toBe('text/plain; charset=utf-8');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app).get('/blob/99999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Blob not found');
    });

    it('should return 400 for invalid blob ID', async () => {
      const response = await request(app).get('/blob/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid blob ID');
    });
  });

  describe('DELETE /blob/:id', () => {
    it('should delete an uploaded file', async () => {
      // First upload a file
      const uploadResponse = await request(app)
        .post('/upload')
        .attach('blob', path.join(__dirname, 'testdoc.txt'));
      
      const fileId = uploadResponse.body.id;
      
      // Then delete it
      const response = await request(app).delete(`/blob/${fileId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('File deleted successfully');

      // Verify file is actually deleted
      const getResponse = await request(app).get(`/blob/${fileId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent file deletion', async () => {
      const response = await request(app).delete('/blob/99999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Blob not found');
    });
  });
});