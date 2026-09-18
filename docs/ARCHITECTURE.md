# Architecture

## Component Map

```text
React/Vite browser
    -> /api/v1 (Express routes, authentication and validators)
        -> Controllers -> Domain services -> Mongoose models -> MongoDB
                              -> OpenAI-compatible chat/embedding provider
                              -> Document parsers and OCR
                              -> Local or temporary upload files
```

The same server also mounts legacy `/api/*` routes. They are separate compatibility surfaces, not guaranteed aliases with identical authorization behavior. New integrations should target `/api/v1` and use the [API contract](../openapi.yaml).

| Location | Responsibility |
| --- | --- |
| [client/src/App.jsx](../client/src/App.jsx) | Browser routes and application composition |
| [client/src/api/client.js](../client/src/api/client.js) | Axios base URL and bearer-token attachment from browser storage |
| [server/server.js](../server/server.js) | Environment loading, middleware, route mounting and listener |
| [server/routes/api/v1](../server/routes/api/v1/) | Versioned API contracts and request authorization |
| [server/controllers](../server/controllers/) | Request orchestration and HTTP outcomes |
| [server/services](../server/services/) | Extraction, validation, calculations, reconciliation, retrieval and reporting |
| [server/models](../server/models/) | Persisted document, evidence, user and workflow records |
| [server/tests](../server/tests/) and [client/tests](../client/tests/) | Unit, integration, persistence and browser regression checks |
| [scratch](../scratch/) | Manual/live diagnostics; not production entry points |

## Document and Evidence Flow

Uploads create document metadata and processing work. Format-specific parsers/OCR provide content used by extraction and indexing services. Document pages, extracted records and chunks preserve different views of the source. Validation flags data-quality issues; reconciliation compares evidence-backed operands. Retrieval and AI answers must retain source attribution rather than treating generated text as authoritative data.

MongoDB metadata is separate from the uploaded binary file: backing up the database alone does not back up source documents. Services for chunking, embeddings, retrieval and reporting consume these records for different workflows; processing failures and unavailable evidence must not be interpreted as zero-valued measurements.

The AI integration uses the OpenAI SDK with configurable endpoint/key and Gemini-named model candidates. Embeddings are requested through the same service. Model availability, dimensions and output quality require provider-specific validation; source comments or presentation labels are not guarantees.

## Roles and Decisions

- `user`: normal authenticated workflows and ownership-scoped access where enforced.
- `reviewer`: delegated review access according to document/report assignment and endpoint rules.
- `admin`: administrative operations and final report approval.

Role names alone do not determine access. Ownership, assignment, account status and operation-specific rules also matter; consult the API guide and authorization tests. Client controls are not a security boundary.

Report edits produce a draft revision and retain prior content. Submission, rejection and approval have separate actor/state rules. Workflow writes use optimistic concurrency. The optional `expectedVersion` field carries the viewed MongoDB `__v`, not the report content version. The browser sends this token and requires explicit reload after a conflict. Other callers that omit it do not receive equivalent stale-view protection.

Reconciliation persistence and review versions are implemented separately from report revisions. Do not reuse their payloads or assume identical conflict semantics.

## Boundaries and Limitations

- Database saves and subsequent audit/notification writes are not one transaction for report workflows.
- `UPLOAD_DIR` supports a persistent volume; default serverless storage remains temporary. Durable job execution and deployed storage recovery are separate operational requirements.
- Browser sessions store bearer credentials in local storage; evaluate XSS and session risks before production deployment.
- JWT configuration now fails closed and production CORS enforces the configured origin. Scoped RAG rechecks current document permissions despite its content cache; this does not certify every legacy route as secure.
- Full corpus accuracy, immutable release artifacts, complete export behavior and production load remain distinct validation tasks.

See [deployment/security](DEPLOYMENT.md) and [testing](TESTING.md) for operational gates. The [PS 26023 requirements mapping](REQUIREMENTS.md) records source provenance, implementation coverage and remaining acceptance gaps.