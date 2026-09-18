# Project Documentation

MineIntel AI is being developed for SIH 2026 around mining-document ingestion, extraction, validation, evidence-backed analysis and reviewed reporting. These guides describe the repository implementation, not an independent certification of its capabilities.

## Reading Order

| Document | Purpose |
| --- | --- |
| [Project overview](../README.md) | Domain, intended solution and repository entry point |
| [SIH 26023 requirements](REQUIREMENTS.md) | Statement provenance, implementation gaps and benefit measurement |
| [Industry and submission guide](INDUSTRY-AND-SUBMISSION.md) | Coal reporting basics, primary sources, pilot scenarios and six-slide draft |
| [Local setup](SETUP.md) | Installation, environment variables and startup checks |
| [Architecture](ARCHITECTURE.md) | Components, data flow and ownership boundaries |
| [Testing](TESTING.md) | Repeatable checks, CI and SIH demonstration acceptance |
| [Deployment and security](DEPLOYMENT.md) | Hosting behavior, release checklist and operational risks |
| [API integration guide](../API_DOCUMENTATION.md) | Consumer examples and reviewer/report workflow semantics |
| [OpenAPI contract](../openapi.yaml) | Machine-readable endpoints, parameters and schemas |
| [Contribution guide](../CONTRIBUTING.md) | Collaboration and contribution expectations |

## SIH Scope and Evidence

The project owner supplied the full statement for PS 26023, Ministry of Coal / Coal India Limited, Software / Smart Automation. The official SIH listing independently confirms the ID, title, organization, category and theme. The [requirements mapping](REQUIREMENTS.md) compares its three core outputs and phased adoption requirements with inspected source code, distinguishes implementation from measured acceptance, and records which details rely on the supplied statement.

Use [demonstration acceptance checks](TESTING.md#sih-demonstration-acceptance) to collect evidence, not a historical all-tests-passed report. A successful build is not proof of extraction accuracy or production readiness. API examples and declared capabilities must also be checked against the deployed commit.

## Maintenance

- Keep one maintained guide per topic; avoid duplicate endpoint inventories and permanent generated test reports.
- Update the API guide and OpenAPI together when public contracts change.
- Update setup/deployment notes when environment variables, providers or storage change.
- Update testing instructions when scripts or CI change. Record unverified areas explicitly.
- Keep secrets, private datasets and generated output out of published documentation.