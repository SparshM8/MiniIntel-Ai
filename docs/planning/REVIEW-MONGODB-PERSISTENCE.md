# Increment 13: isolated MongoDB review persistence tests


Follows merged PR #13. Adds real MongoDB coverage without changing application behavior.

## Isolation and reproduction

Install locked dependencies using `npm ci --prefix server --ignore-scripts --no-audit --no-fund`, then run `npm run test:persistence --prefix server` from the repository root.

The suite uses pinned mongodb-memory-server-core 11.2.0 to launch an actual MongoDB 7.0.14 child process on loopback with a generated database name, random port, and temporary storage. It does not load dotenv, server startup, or application database URIs. The first run downloads a MongoDB binary (about 592 MB on Windows), with MD5 checking enabled; subsequent runs use the dependency's binary cache. A test after-hook disconnects Mongoose and stops the child process, including when setup fails after process creation. No system service, Docker, or privileged installation is needed.

Only synthetic data is written. Controllers are called directly with minimal request/response objects; real Mongoose operations and the database are not mocked. Importing the controller loads extraction dependencies, but tests never invoke extraction or AI provider methods. The test command is separate from dependency-free unit and parser/model integration suites.

## Coverage

Seven tests verify:

1. DocumentPage insertMany/read-back retains zero, boolean values, and missing formula caches; cell matching works after persistence.
2. Record editing persists value/unit history and dates while retaining originalValue and extraction-time cell evidence. Changed-value citations downgrade after a database read. Repeating an identical string update does not add history.
3. Approve/reject persist status and reviewedAt.
4. Bulk approval changes supplied existing IDs only, not unrelated records.
5. Single-record mutations return 404 for valid nonexistent IDs; empty bulk input returns 400.
6. getRecords reads only its document scope and orders records by page.
7. Query approval of a legacy raw record does not backfill fact metadata or cell references.

Local Windows/Node 24: 7 persistence tests passed. The normal server unit suite and parser/model integration suite are also run before commit. CI adds a Windows/Node 20 persistence job; remote CI outcomes are not yet verified.

## Observations and limits

The current bulk controller returns success even when some valid supplied IDs do not exist. The test characterizes this behavior, not an all-records-success guarantee. Repeated review actions can update timestamps; no exactly-once guarantee is established. Reviewer identity, concurrent writes, transactions, authorization middleware, HTTP routes, malformed-ID handling, and failure injection remain unverified here.

This closes the basic local persistence gap but is not a production-database certification. MongoDB is a standalone temporary instance, not a replica set. No production dependency, schema, or controller behavior changes are included. Future work should add explicit bulk outcome counts and HTTP authorization tests before stronger review guarantees are advertised.
