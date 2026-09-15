# Increment 10: save recovery and modal keyboard behavior

Follows merged PR #10. Focuses on editing a record, not approval/rejection workflows.

## Changes

- Save errors propagate to the editor and appear as an alert without dropping the draft. Wording says save was not confirmed, because network failure does not prove a server write failed.
- A synchronous in-flight guard blocks duplicate submissions; inputs, Save, Cancel, and Close are disabled during the request. Escape is also withheld while saving.
- Successful updates patch the submitted value/unit locally only after API success, preserving the table and opener for focus restoration. Other server-generated fields are not refreshed here; authoritative metadata is obtained on the next reload. No optimistic update occurs before success.
- A native modal dialog prevents interaction with the background. It has an accessible name and labeled value/unit inputs. Initial focus goes to Value, Tab/Shift+Tab wrap, Escape cancels when idle, and closing returns focus to the opener if it still exists.
- Save completion checks document/request scope before changing visible state.

## Verification

Local Chromium browser suite: 7 passed (3 new). Tests cover initial focus, tab containment, Escape/focus restoration, failed-save draft preservation, retry success, and pending-save duplicate/dismissal protection. Existing source-rendering and stale-document regression tests also pass. Client presentation suite: 15 passed. Production build passed with the existing large-bundle warning.

The tests use intercepted synthetic API responses. They do not prove persistence, authorization, server-side idempotency, concurrent-edit resolution, or screen-reader/cross-browser compatibility. Pending requests currently have no dedicated timeout/cancel UI; application navigation or closing the tab can still interrupt the session. Approval/rejection error handling remains separate work. No dependency, schema, or API contract changes are introduced.
