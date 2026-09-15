# Increment 9: reviewer browser workflow regression tests

Follows merged PR #9. Adds Chromium tests against the real React application with synthetic, intercepted API responses. No live backend, database, or AI provider is used. Browser nonlocal requests are blocked, API requests are fulfilled locally, and a synthetic cached user opens the reviewer route; this is not an authentication test.

## Coverage and fix

Four browser tests verify keyboard disclosure, safe literal rendering of an HTML-looking source excerpt, immediate unsaved-value warnings with cancel preservation, failed document switches, and late-response isolation (the first test combines disclosure and rendering checks).

The failed-switch test initially reproduced a real bug: after switching to another document and receiving an API error, the previous document's evidence remained visible. The page now clears records/editor state on scope changes, ignores superseded loads using request generations, and resets table selection by document key. A late old-document response cannot replace current records. This does not cancel server-side requests or fully revise the extraction/approval mutation lifecycle.

## Reproduction

From the repository root, install locked client dependencies with `npm ci --prefix client --ignore-scripts --no-audit --no-fund`. From the client directory, run `npx playwright install chromium`. Then run `npm run test:browser --prefix client` from the repository root.

Playwright owns a loopback Vite server on port 4179 and stops it when the test run ends. Existing servers are not reused. Browser binaries are downloaded into the user's Playwright cache, not committed. Local failure traces contain only synthetic fixture data and are ignored by Git; CI does not upload traces. The test suite adds a pinned development dependency and updates the client lockfile, not production dependencies.

Local results on Windows/Node 24: 4 Chromium browser tests and 15 client presentation tests passed; the production build completed with the existing large-bundle warning. CI adds a Windows/Node 20 browser job to avoid privileged system-package installation. Remote CI results must be checked separately.

## Limits

This is mocked-API browser coverage, not end-to-end persistence or authorization verification. No Firefox/WebKit, screen-reader audit, mobile layout certification, save/approval failure workflow, or live service tests are claimed. Follow-up should cover mutation errors and modal focus behavior, then real isolated MongoDB persistence and source-version snapshots.
