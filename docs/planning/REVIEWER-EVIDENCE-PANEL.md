# Increment 8: reviewer evidence presentation


Follows merged PR #8. Adds an expandable source-evidence panel to the extraction review table and record editor using records already returned by the existing API. No additional network request or access path is introduced.

## Behavior

- Display typed sheet/cell references instead of synthetic spreadsheet page numbers.
- Label matching values as value matched, with an explicit semantic-review warning. Header, unit, entity, and period correctness are not implied.
- Show unverified status and a reason for missing/invalid references or changed values.
- Recalculate presentation against the editor's unsaved value, so a correction immediately removes the matched-cell claim.
- Preserve zero when initializing the editor.
- Show original/current values, entity/period labels, and the stored extraction excerpt. The excerpt is explicitly not independently verified and is rendered as React text, not HTML/Markdown.
- Legacy page metadata is labeled as a recorded page/index because its physical-page semantics are unknown.
- Use native details/summary disclosure, bounded excerpt scrolling, and a scrollable editor on small screens.

## Verification

Local results: 15 client presentation tests passed; production Vite build passed. Presentation tests compare supported numeric cases with the server's recordSource result to guard against divergent matching semantics. The production build reports a large-chunk warning; bundling optimization is not included here.

CI now runs client presentation tests on Node 20/24 and builds the client on Node 20. Install uses the unchanged lockfile with lifecycle scripts disabled. No new dependencies or backend APIs are added.

These tests cover the pure presentation model, not mounted React interactions. No browser session, assistive-technology audit, live backend, or permission workflow was exercised. The panel is an evidence summary, not a workbook viewer; it does not fetch cell neighborhoods or certify source versions. Existing approval actions remain unchanged and do not constitute semantic verification. A dedicated browser review and isolated persistence test remain recommended follow-up work.
