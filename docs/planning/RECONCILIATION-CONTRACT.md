# Reconciliation contract v1

## Purpose

This contract defines the minimum evidence needed before MineIntel compares extracted facts. It does not decide which source is correct, perform conversions, write to the database, or approve reports. Those are later phases.

## Fact input

Every candidate fact must preserve:

- `factId`: stable identity within the case.
- `entityId`: explicit mine, subsidiary, or other entity identity.
- `metricId`: normalized metric identity.
- `role`: `actual` or `target`; these roles are not interchangeable.
- `value`: finite JSON number. Zero is valid; missing, malformed, NaN and infinity are not.
- `unit`: explicit source unit. Phase 2 will own a closed conversion registry.
- `period`: canonical key plus inclusive ISO start/end dates. Ambiguous periods must be resolved before reconciliation.
- `source.documentId`: source document identity.
- `source.revisionId`: exact source revision identity.
- `source.locator`: page, worksheet cell, or equivalent inspectable location.
- `source.publicationStatus`: `draft`, `final`, or `unknown`.

The contract intentionally does not use confidence scores as evidence.

## Outcome vocabulary

Phase 2 must return exactly one outcome and machine-readable reason codes:

- `matched`: compatible scope, unit and role with equal normalized values.
- `converted`: equal values after an allowed deterministic conversion.
- `conflict`: comparable facts disagree; no source is silently selected.
- `incompatible`: facts must not be compared, for example different entities, periods, roles, metrics or unsupported units.
- `insufficient_evidence`: comparison cannot be supported because required evidence is ambiguous or unavailable.

## Acceptance scenarios

Synthetic fixtures cover equal values, deterministic unit conversion, conflicting final values, different periods/entities, unsupported units, unknown publication status, new source revisions, actual-versus-target separation, and genuine zero.

The `expectedOutcome` in each fixture is an acceptance requirement for Phase 2. Phase 1 validates fixture shape only; it does not implement reconciliation logic.

## Safety boundaries

- No LLM arithmetic or semantic guessing.
- No broadening entity or period scope when values are missing.
- No treating missing values as zero.
- No selecting the latest revision merely because it is latest.
- No treating draft/unknown publication status as approved evidence.
- No mutation of source facts during comparison.
- No persistence, API, UI, or production migration in Phase 1.
