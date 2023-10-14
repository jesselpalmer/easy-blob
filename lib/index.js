const express = require('express');
const multer = require('multer');
const path = require('path');
const Database = require('./database');

class BlobStorage {
    constructor(options) {
        this.app = express();
        this.db = new Database(options.dbPath);
        this.storageDir = options.storageDir || path.join(__dirname, '..', 'uploads');
        this.storage = multer.diskStorage({
            destination: this.storageDir,
            filename: (req, file, cb) => {
                cb(null, Date.now() + path.extname(file.originalname));
            }
        });
        this.upload = multer({ storage: this.storage });

        this.routes();
    }

    routes() {
        this.app.post('/upload', this.upload.single('blob'), (req, res) => {
            if (!req.file) {
                return res.status(400).send('No file uploaded');
            }

            const { originalname, mimetype, filename } = req.file;
            console.log(`Received file upload. Original name: ${originalname}, MIME type: ${mimetype}, Saved filename: ${filename}`);
            this.db.insertBlob(originalname, mimetype, filename, (err, id) => {
                if (err) {
                    console.error(`Error inserting blob metadata into database: ${err.message}`);
                    return res.status(500).send('Server error');
                }
                res.send(`File uploaded and saved with ID: ${id}`);
            });
        });

        this.app.get('/blob/:id', (req, res) => {
          const blobId = req.params.id;
          console.log(`Received request for blob with ID ${blobId}`);
          
          this.db.getBlob(blobId, (err, row) => {
              if (err) {
                  console.error(`Error fetching blob with id ${blobId}: ${err.message}`);
                  return res.status(500).send('Server error');
              }

              if (!row) {
                  return res.status(404).send('Blob not found');
              }

              console.log(`Serving file for request to blob ID ${blobId}. Metadata:`, JSON.stringify(row));

              res.sendFile(row.path, { root: this.storageDir });
          });
      });
    }

    start(port) {
        this.app.listen(port, () => {
            console.log(`Blob storage server started on port ${port}`);
        });
    }
}

module.exports = BlobStorage;
