import express, { Request, Response, Application } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Database, BlobMetadata } from './database';

/**
 * Configuration options for BlobStorage instance
 */
export interface BlobStorageOptions {
  /** Directory where uploaded files will be stored. Defaults to './uploads' */
  storageDir?: string;
  /** Path to SQLite database file. Defaults to './blob-storage.db' */
  dbPath?: string;
  /** Maximum file size in bytes. Defaults to 10MB (10485760 bytes) */
  maxFileSize?: number;
  /** Array of allowed MIME types. Empty array allows all types */
  allowedMimeTypes?: string[];
}

/**
 * Response format for successful file uploads
 */
export interface UploadResponse {
  /** Unique identifier for the uploaded file */
  id: number;
  /** Success message */
  message: string;
}

/**
 * Response format for error responses
 */
export interface ErrorResponse {
  /** Error message describing what went wrong */
  error: string;
}

/**
 * Easy-to-use local blob storage with Express server and SQLite database.
 *
 * Provides a simple HTTP API for uploading, downloading, listing, and deleting files.
 * Files are stored on the local filesystem with metadata tracked in SQLite.
 *
 * @example
 * ```typescript
 * const storage = new BlobStorage({
 *   storageDir: './my-uploads',
 *   maxFileSize: 5 * 1024 * 1024, // 5MB
 *   allowedMimeTypes: ['image/jpeg', 'image/png']
 * });
 * storage.start(3000);
 * ```
 */
export class BlobStorage {
  /** Express application instance */
  private app: Application;
  /** Database instance for metadata storage */
  private db: Database;
  /** Directory path where files are stored */
  private storageDir: string;
  /** Multer middleware for handling file uploads */
  private upload: multer.Multer;
  /** Configuration options with defaults applied */
  private options: BlobStorageOptions;

  /**
   * Creates a new BlobStorage instance with the specified options.
   *
   * @param options - Configuration options for the blob storage
   */
  constructor(options: BlobStorageOptions = {}) {
    // Apply default values to options
    this.options = {
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      allowedMimeTypes: [], // empty array means allow all
      ...options,
    };

    // Initialize Express app
    this.app = express();

    // Initialize database
    this.db = new Database(this.options.dbPath || path.join(process.cwd(), 'blob-storage.db'));

    // Set up storage directory
    this.storageDir = this.options.storageDir || path.join(process.cwd(), 'uploads');

    // Create storage directory if it doesn't exist
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: this.storageDir,
      filename: (req, file, cb) => {
        // Generate unique filename with timestamp and original extension
        cb(null, Date.now() + path.extname(file.originalname));
      },
    });

    // Create multer instance with size limits and file filtering
    this.upload = multer({
      storage,
      limits: {
        fileSize: this.options.maxFileSize,
      },
      fileFilter: (req, file, cb) => {
        // Check if file type is allowed (if restrictions are configured)
        if (
          this.options.allowedMimeTypes!.length > 0 &&
          !this.options.allowedMimeTypes!.includes(file.mimetype)
        ) {
          return cb(new Error(`File type ${file.mimetype} not allowed`));
        }
        cb(null, true);
      },
    });

    // Set up API routes
    this.routes();
  }

  /**
   * Provides access to the underlying Express application.
   * Useful for testing or adding custom middleware.
   *
   * @returns The Express application instance
   */
  get expressApp(): Application {
    return this.app;
  }

  /**
   * Sets up all HTTP API routes for the blob storage service.
   *
   * Routes:
   * - POST /upload - Upload a new file
   * - GET /files - List all uploaded files
   * - GET /blob/:id - Download a file by ID
   * - DELETE /blob/:id - Delete a file by ID
   */
  private routes(): void {
    /**
     * POST /upload
     * Uploads a single file and stores its metadata in the database.
     *
     * Expected: multipart/form-data with 'blob' field containing the file
     * Returns: JSON with file ID and success message
     * Errors: 400 (no file, file too large, invalid type), 500 (server error)
     */
    this.app.post('/upload', (req: Request, res: Response) => {
      this.upload.single('blob')(req, res, (err) => {
        // Handle multer errors (file size, type restrictions, etc.)
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' } as ErrorResponse);
          }
          return res.status(400).json({ error: err.message } as ErrorResponse);
        }

        // Check if file was actually uploaded
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' } as ErrorResponse);
        }

        const { originalname, mimetype, filename } = req.file;
        console.log(
          `Received file upload. Original name: ${originalname}, MIME type: ${mimetype}, Saved filename: ${filename}`
        );

        // Store file metadata in database
        this.db.insertBlob(originalname, mimetype, filename, (err, id) => {
          if (err) {
            console.error(`Error inserting blob metadata into database: ${err.message}`);
            return res.status(500).json({ error: 'Server error' } as ErrorResponse);
          }
          res.json({ id: id!, message: 'File uploaded successfully' } as UploadResponse);
        });
      });
    });

    /**
     * GET /files
     * Returns a list of all uploaded files with their metadata.
     *
     * Returns: JSON array of file objects with id, original_name, mime_type, etc.
     * Errors: 500 (server error)
     */
    this.app.get('/files', (req: Request, res: Response) => {
      this.db.getAllBlobs((err: Error | null, rows?: BlobMetadata[]) => {
        if (err) {
          console.error(`Error fetching files: ${err.message}`);
          return res.status(500).json({ error: 'Server error' } as ErrorResponse);
        }
        res.json(rows || []);
      });
    });

    /**
     * GET /blob/:id
     * Downloads a file by its unique ID.
     *
     * Params: id - The unique identifier of the file to download
     * Returns: The actual file content with appropriate headers
     * Errors: 400 (invalid ID), 404 (file not found), 500 (server error)
     */
    this.app.get('/blob/:id', (req: Request, res: Response) => {
      const blobId = parseInt(req.params.id);

      // Validate the blob ID
      if (isNaN(blobId) || blobId <= 0 || !Number.isInteger(blobId)) {
        return res.status(400).json({ error: 'Invalid blob ID' } as ErrorResponse);
      }

      console.log(`Received request for blob with ID ${blobId}`);

      // Look up file metadata in database
      this.db.getBlob(blobId, (err: Error | null, row?: BlobMetadata) => {
        if (err) {
          console.error(`Error fetching blob with id ${blobId}: ${err.message}`);
          return res.status(500).json({ error: 'Server error' } as ErrorResponse);
        }

        if (!row) {
          return res.status(404).json({ error: 'Blob not found' } as ErrorResponse);
        }

        console.log(
          `Serving file for request to blob ID ${blobId}. Metadata:`,
          JSON.stringify(row)
        );

        // Check if the file exists before sending it
        const filePath = path.join(this.storageDir, row.path);
        fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK, (accessErr) => {
          if (accessErr) {
            console.error(`File access error for blob ID ${blobId}: ${accessErr.message}`);
            return res
              .status(404)
              .json({ error: 'File not found or inaccessible' } as ErrorResponse);
          }

          // Send the actual file
          res.sendFile(row.path, { root: this.storageDir }, (err) => {
            if (err) {
              console.error(`Error serving file for blob ID ${blobId}: ${err.message}`);
              return res.status(500).json({ error: 'Error serving the file' } as ErrorResponse);
            }
          });
        });
      });
    });

    /**
     * DELETE /blob/:id
     * Deletes a file by its unique ID, removing both the database record and physical file.
     *
     * Params: id - The unique identifier of the file to delete
     * Returns: JSON success message
     * Errors: 400 (invalid ID), 404 (file not found), 500 (server error)
     */
    this.app.delete('/blob/:id', (req: Request, res: Response) => {
      const blobId = parseInt(req.params.id);

      // Validate the blob ID
      if (isNaN(blobId) || blobId <= 0 || !Number.isInteger(blobId)) {
        return res.status(400).json({ error: 'Invalid blob ID' } as ErrorResponse);
      }

      // First get the blob metadata to find the physical file path
      this.db.getBlob(blobId, (err: Error | null, row?: BlobMetadata) => {
        if (err) {
          console.error(`Error fetching blob with id ${blobId}: ${err.message}`);
          return res.status(500).json({ error: 'Server error' } as ErrorResponse);
        }

        if (!row) {
          return res.status(404).json({ error: 'Blob not found' } as ErrorResponse);
        }

        // Delete the physical file first
        const filePath = path.join(this.storageDir, row.path);
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error(`Error deleting physical file: ${err.message}`);
            return res
              .status(500)
              .json({ error: 'Failed to delete physical file' } as ErrorResponse);
          }

          // Delete the database record
          this.db.deleteBlob(blobId, (err: Error | null, deleted?: boolean) => {
            if (err) {
              console.error(`Error deleting blob from database: ${err.message}`);
              return res.status(500).json({ error: 'Server error' } as ErrorResponse);
            }

            if (!deleted) {
              return res.status(404).json({ error: 'Blob not found' } as ErrorResponse);
            }

            res.json({ message: 'File deleted successfully' });
          });
        });
      });
    });
  }

  /**
   * Starts the HTTP server on the specified port.
   *
   * Also sets up graceful shutdown handlers for SIGTERM and SIGINT signals.
   *
   * @param port - The port number to listen on
   */
  start(port: number): void {
    const server = this.app.listen(port, () => {
      console.log(`Blob storage server started on port ${port}`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  }
}
