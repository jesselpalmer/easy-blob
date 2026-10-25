# Storage operations and recovery

## Supported ownership and trust boundary

One live `BlobStorage` instance owns each canonical storage directory and SQLite database path.
Do not open another instance with either location, even if its other path differs. Run one process
and one instance; cluster workers, multiple containers, shared volumes and network filesystems are
not a supported deployment model. SQLite operations are short synchronous operations on the Node.js
thread; listing is unpaginated.

Use a dedicated local directory controlled by the application account. The database must be outside
the storage directory, and its parent directory must already exist. The blob directory is created
recursively. Do not place unrelated data in reserved filenames. Do not let untrusted users replace
files, change symlinks, edit metadata, rename ownership directories or manipulate hard links.
Filesystem containment checks do not defend against a separate privileged local process racing them.

Initialization canonicalizes locations and acquires exclusive ownership directories:

- `<storageDir>/.easyblob-owner.lock/owner.json`
- `<dbPath>.easyblob-lock/owner.json`

A persistent `.easyblob-store.json` file in the blob directory and an `easyblob_store` table in SQLite
record the same store identity. They prevent a new, mistyped or mismatched database from being paired
with an existing managed directory. A mismatch or a missing identity on one side fails readiness
before recovery. Initial legacy adoption is permitted only when neither identity exists and the
directory has no reserved managed UUID files. Preserve both identity records in backups.

A second owner fails readiness. This applies to a shared storage directory with different databases
and a shared database with different storage directories. Owner information helps diagnose a lock;
it is not a lease whose age permits automatic takeover. Normal awaited closure releases ownership.

## Successful operations and concurrent requests

An upload writes to an exclusively created `easyblob-<UUID>.blob` file. That file is private to the
operation and is not served until the complete stream has closed and metadata insertion commits.
A `200` response acknowledges those two steps. Original names do not determine storage paths.
An identifier collision cannot overwrite an existing file; creation fails or retries safely.

An upload error attempts to remove its uncommitted file. Cleanup failure or abrupt interruption may
leave an owned orphan. Startup preserves it for manual inspection instead of deleting unreferenced
bytes automatically; an older restored database might otherwise cause newer uploaded data to be lost. Aborted
and oversized uploads are not intentionally committed.
A disconnect after metadata commits can still leave a stored blob: a missing response is not proof
that an operation failed. Retrying an upload can create another object because there is no
idempotency-key contract.

Listing and lookup use existing integer metadata IDs. Invalid IDs are rejected before lookup.
Deletion and metadata changes are serialized within the owner. A download holds a read lease until
its file handle closes, so a concurrent delete waits for an admitted read to finish. A delete that
wins the race makes subsequent reads return `404`. Concurrent deletes result in one successful
logical deletion and later `404` responses. The delete waits while holding the store operation queue,
so a slow active download followed by deletion can also delay unrelated listings, lookups and upload
commits. Configure transfer/response deadlines in the hosting application or proxy; this simple queue
is intended for small workloads. A failed transfer may close the HTTP connection after headers;
it does not send a second JSON response.

Deletion first commits an SQLite transaction that removes metadata and records the filename in a
pending-deletion journal. It then unlinks bytes and clears the journal. Database failure before that
commit preserves the file and metadata. A filesystem failure after the commit returns `500`, but
lookup/listing already treat the blob as deleted. Retrying GET can therefore return `404` after a
failed DELETE. Startup replays the journal until physical cleanup succeeds. Do not treat `404` as
proof that pending physical bytes have already been erased.

## Crash windows and startup recovery

| Interruption point | Observable state | Startup behavior |
| --- | --- | --- |
| During upload, before metadata commit | Partial or complete unreferenced managed file | Preserve for offline inspection |
| After metadata commit, before upload response arrives | Blob may exist although caller saw no response | Keep referenced bytes and metadata |
| Before deletion transaction commits | Original metadata and bytes remain | Keep original blob |
| After deletion transaction commits, before unlink | Blob absent from API; journal and bytes remain | Retry unlink, then clear journal |
| After unlink, before journal cleanup | Blob absent; journal remains | Treat already missing bytes as removed, then clear journal |

Automatic recovery removes only files explicitly recorded in the pending-deletion journal.
Unreferenced managed files and unknown legacy files are preserved for manual inspection. A missing
metadata reference alone cannot prove that bytes are disposable: the database could be an older
backup. Historical files are removed only by a valid explicit deletion operation. Do not use reserved
managed filename patterns or `.easyblob-store.json` for unrelated application files.

Inspect orphans only while the store is stopped and after taking a paired backup. Compare exact
filenames with metadata and pending deletion records, investigate the interrupted operation or backup
history, and retain uncertain files. Remove a specific orphan only after confirming it is unwanted.
EasyBlob does not automatically reattach orphan bytes to metadata or guess an original filename.

The owner validates metadata paths, duplicate references and existing file types before destructive
recovery. Unsafe paths, duplicate paths, referenced symlinks and nonregular files fail readiness.
Inspect and repair such data offline, preserving a backup first. A missing referenced file is retained
in metadata: GET returns `404`, listing still shows the record, and explicit DELETE can remove it.
Recovery cannot reconstruct missing or externally changed bytes. If identity initialization is
interrupted, one side can exist without the other and readiness fails closed. Preserve the data,
inspect both identities offline and restore the correct paired backup; do not erase identity records
simply to make the error disappear.

This sequence provides application-level compensation and restart cleanup, not a single atomic
transaction spanning SQLite and the filesystem. It does not claim coordinated fsync, power-loss
durability, protection from disk corruption, or transactionality across concurrent external programs.
A filesystem may lose recently written data after a power failure even when a request was acknowledged.

## Recovering a stale ownership lock

An abrupt process exit can leave both ownership directories. A failed second start must never
silently steal them.

1. Stop every process, service, container and worker that could access either data location. Confirm
   the recorded owner is no longer running; a PID alone is insufficient if it may have been reused.
2. Make a backup of the stopped metadata file, blob directory and any journal/sidecar files.
3. Inspect the two `owner.json` files for PID/hostname information. Verify the configured canonical
   paths and matching persistent store identities; owner records alone do not identify the pair.
4. Remove only the two ownership lock directories listed above. Do not remove the database or
   blob directory. If ownership is uncertain, leave the locks and investigate.
5. Start one instance and await readiness. It validates metadata and runs pending recovery before
   serving requests. If recovery fails, correct the reported filesystem/database issue and retry.

A stale lock is an operational recovery step, not evidence that data itself is corrupt.

## Shutdown

Call and await `storage.close()`. It stops admitting new requests and waits for active work.
After `shutdownTimeoutMs` it cancels remaining HTTP transfers so slow clients cannot retain the
store indefinitely. Interrupted callers can observe failed connections and should reconcile outcomes.
The default grace period is five seconds; choose one appropriate to upload size and deployment grace.

`start()` returns a server owned by the storage instance, which closure stops. If your application
creates the server, stop accepting requests on that server and close storage together, then await
both. The packaged example demonstrates this. Do not call `process.exit()` before closure finishes.
The library never registers signal handlers. Repeated close calls share the same completion result.

## Back up and restore

For a consistent backup, stop traffic and await closure, then copy the SQLite database, its existing
sidecar/journal files and the entire blob directory, including `.easyblob-store.json`, as one set. A backup of
only files or only
metadata is insufficient. Use application-owned paths and restrict permissions on backups: they can
contain every user's file and original filename.

Restore the paired backup to stopped local paths. Do not restore live-owner lock directories as
active ownership; after confirming no owner is running, remove stale locks using the procedure
above. Configure the matching `storageDir` and `dbPath`, start one instance, await readiness, and
verify listing plus representative text and binary downloads before reopening traffic.

The existing SQLite metadata table and numeric IDs are retained in 2.0. The deletion journal and
store identity table/file are additive.
Do not downgrade a store with pending recovery work to 1.x; restore a pre-upgrade backup instead.

## Network and content responsibilities

Standalone serving binds loopback unless an explicit host is supplied. Binding `0.0.0.0` exposes
all IPv4 interfaces and requires deliberate network controls. Supply TLS, authentication,
authorization, rate limiting and deployment-level request timeouts in the hosting application/proxy.
Authentication must run before the mounted router, including multipart parsing.

MIME filtering checks caller declarations only. Downloads are attachments with a generic binary
content type and `nosniff`; these headers do not scan files or make their contents safe to open.
Apply content inspection and malware policy separately if the application needs them.

There is no per-user ownership field, quota, full-text search, pagination, replication or retention
scheduler. All records are visible through `/files` to a caller allowed through the host's middleware.
