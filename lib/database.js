const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(`Error initializing SQLite database: ${err.message}`);
                throw err;
            }
            console.log('Connected to the SQLite database.');
            this.initialize();
        });
    }

    initialize() {
        this.db.run(`CREATE TABLE IF NOT EXISTS blob_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT,
            mime_type TEXT,
            path TEXT,
            upload_timestamp TEXT
        )`, (err) => {
            if (err) {
                console.error(`Error creating blob_metadata table: ${err.message}`);
            } else {
                console.log("blob_metadata table initialized or already exists.");
            }
        });
    }

    insertBlob(original_name, mime_type, path, callback) {
      const statement = this.db.prepare(`INSERT INTO blob_metadata(original_name, mime_type, path, upload_timestamp) VALUES(?, ?, ?, ?)`);

      statement.run(original_name, mime_type, path, new Date().toISOString(), function(err) {
          if (err) {
              console.error(`Error inserting blob metadata into database: ${err.message}`);
          } else {
              console.log(`Inserted blob metadata:`, JSON.stringify({
                  filename: path,
                  mimeType: mime_type,
                  originalName: original_name
              }));
          }
          callback(err, this.lastID);
      });
      statement.finalize();
  }

  getBlob(id, callback) {
    this.db.get(`SELECT * FROM blob_metadata WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error(`Error fetching blob with id: ${id}, Error: ${err.message}`);
        } else if (row) {
            console.log(`Fetched blob metadata for id ${id}:`, JSON.stringify(row));
        }
        callback(err, row);
    });
  }
}

module.exports = Database;
