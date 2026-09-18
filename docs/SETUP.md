# Local Setup

## Prerequisites

- Node.js 24.x LTS is required by all package manifests and CI. Office parser 8 requires a modern runtime; Node 20 is no longer supported by this project.
- npm, Git, an approved MongoDB instance, and an OpenAI-compatible AI provider endpoint with usable chat and embedding models.
- Internet access for initial dependency, browser, MongoDB-test-binary and OCR language-data downloads as applicable.

Run commands from the repository root. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci --prefix server --ignore-scripts --no-audit --no-fund
npm ci --prefix client --ignore-scripts --no-audit --no-fund
```

These match the locked installation approach in CI. Live OCR and external AI still need separate validation; installation is not an operational readiness check.

## Server Environment

Create a private `server/.env` with your own values; do not commit it or share secrets in chat. The server loads this file, then a root `.env` as fallback; existing process environment values take precedence.

```dotenv
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/mineintel_dev
JWT_SECRET=replace-with-a-long-random-private-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-unique-private-password
LLM_API_KEY=replace-with-your-provider-key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL=replace-with-a-chat-model-your-provider-supports
CLIENT_URL=http://localhost:5173
```

The provider URL is an example for Gemini's OpenAI-compatible interface, not a verified deployment configuration. Confirm model availability and quotas with the provider.

| Variable | Actual usage |
| --- | --- |
| `MONGODB_URI` | Database connection; use a dedicated development database |
| `JWT_SECRET` | Required private JWT signing/verification secret; missing, blank or `fallback_secret` configuration is rejected |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Configured administrator identity; v1 login can create its database record after successful configured-password authentication |
| `LLM_API_KEY`, `LLM_BASE_URL` | Credentials and base URL used by the OpenAI SDK in the AI service |
| `GEMINI_MODEL` | Optional chat-model candidate; individual calls can supply another model |
| `CLIENT_URL` | Allowed browser origin; production excludes development localhost defaults and rejects unknown origins |
| `UPLOAD_DIR` | Optional absolute directory on a persistent volume; default is `server/uploads`, or `/tmp/uploads` on Vercel |
| `PORT`, `NODE_ENV` | Server port and environment label |

`GEMINI_API_KEY` alone does not configure the current [AI service](../server/services/llmService.js). Embeddings currently request `gemini-embedding-2` in code, with no environment override. Provider support must be checked before indexing documents. Never use `mock-key-for-testing` to represent real AI behavior in a demonstration.

The main server uses `MONGODB_URI`; do not assume historical scratch or seeding scripts use the same configuration. No account seeding script is required for standard v1 administrator login. Do not create demo accounts in a shared database without approval.

## Run Locally

In one terminal:

```sh
npm run dev --prefix server
```

In another:

```sh
npm run dev --prefix client
```

Open `http://localhost:5173`. Vite proxies `/api` and `/uploads` to `http://localhost:5000`. Changing the backend port also requires updating the proxy or configuring the client API URL.

The frontend defaults to `/api/v1`. For a separately hosted API, set `VITE_API_URL` in a private client environment file before building. Vite variables are public browser configuration: never put API keys or server secrets in them.

Request `GET http://localhost:5000/api/v1/health`. Expect 200 and `data.database: connected`; 503 indicates a degraded database state. Health does not test the AI provider, OCR, exports or storage durability.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Database fails or health returns 503 | URI, credentials, network access and selected database; never print the connection secret |
| Administrator login returns configuration error | Server loaded the intended `ADMIN_PASSWORD` and administrator username |
| AI requests fail despite a Gemini key | `LLM_API_KEY`, compatible base URL, requested models and quota; restart after environment changes |
| Client API requests fail | Backend availability, proxy target and build-time `VITE_API_URL` |
| Browser tests cannot start Vite | Port 4179 must be free; install Playwright Chromium |
| Large client chunk warning | Build can succeed with this warning; bundle optimization is a separate task |

Continue with [testing](TESTING.md) before using live verification scripts. See [deployment](DEPLOYMENT.md) before exposing the server publicly.