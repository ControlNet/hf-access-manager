# `hf-access-manager`

> A minimal, stateless, self-hosted dashboard for delegating Hugging Face gated repository access management without sharing the repository owner's Hugging Face token.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/ControlNet/hf-access-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/ControlNet/hf-access-manager/actions)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

---

## Overview

Research labs and creators often manage multiple gated Hugging Face models or datasets (such as LLaMA-based checkpoints or curated benchmark datasets) that require manual review before access is granted. 

Traditionally, delegating review access requires either:
1. Handing out an administrative Hugging Face API token to student reviewers (high security risk).
2. Forcing the repository owner to review every request personally.

**`hf-access-manager`** solves this by providing a unified, password-protected "Access Approval Inbox". Reviewers can inspect gated form responses, batch-approve or reject requests, browse access histories, or manually grant access—all without ever exposing the repository owner's `HF_TOKEN`.

The application is:
- **100% Stateless & Database-Free**: Hugging Face Hub itself remains the single source of truth.
- **Unified Review Inbox**: Aggregates requests across multiple models and datasets into a single queue.
- **Zero-Friction Review Flow**: Direct 1-click approvals and 1-click rejections without unnecessary confirmation prompts.
- **Repository Failure Isolation**: Successfully loaded repositories remain available; incomplete totals are marked and failed loads can be retried.
- **Deployment**: Supports Vercel or Docker with runtime configuration and documented request limits.

---

## Architecture

```text
Browser (Reviewer)
    │
    │  Cookie Auth (jose JWT, SameSite=Lax, HttpOnly)
    ▼
Next.js App Router (Server-side Only)
    │
    │  Strict Allowlist Validation (`HF_REPOSITORIES`)
    │  Timing-Safe Password Verification
    │  Native fetch() with Authorization: Bearer <HF_TOKEN>
    ▼
Hugging Face Hub API (https://huggingface.co/api/...)
    │
    ├── Models (`/api/models/{repo_id}/user-access-request/...`)
    └── Datasets (`/api/datasets/{repo_id}/user-access-request/...`)
```

### Security Boundary
- `HF_TOKEN`, `APP_PASSWORD`, and `AUTH_SECRET` are strictly **server-only**. They are never prefixed with `NEXT_PUBLIC_` and never bundled into client JavaScript.
- All state-changing mutations (`approve`, `reject`, `revoke`, `grant`) strictly validate the requested repository against the configured `HF_REPOSITORIES` allowlist before contacting Hugging Face.
- Arbitrary repository mutations or unauthorized Hugging Face token misuse are blocked server-side (`HTTP 403 FORBIDDEN_REPOSITORY`).
- Login, logout, and access mutations validate the full origin. `X-Forwarded-Host` is never trusted. Set `APP_ORIGIN` to your public HTTPS origin when a proxy rewrites `Host`.
- Protected API handlers and server pages verify the session independently of Middleware.
- Pagination accepts only HTTPS links on the original Hugging Face origin and exact repository/status path. Redirects and cyclic links are rejected. Overlapping rows are deduplicated.

---

## Features

- **Unified Inbox Queue**: Review pending requests across all your configured models and datasets from one view.
- **One-Click Actions**:
  - **Approve**: Instant approval with immediate optimistic UI update.
  - **Reject**: 1-click rejection without dialogue or justification prompts. Mistakes can be undone anytime from the *Rejected* tab.
- **Bulk Actions**: Select up to 100 pending requests per batch. At most five mutations run concurrently; unresolved pending items remain selected after reconciliation. This limits concurrency, not requests per second.
- **Every Answer on the List**: Arbitrary gated questions (affiliation, role, country, intended use, terms) are parsed and shown on the request row itself — no second panel to open. Every answer is on the row, always, however many the form asks: the ones that decide most reviews lead, the long free-text answer sits beneath them in full, and nothing is folded behind a click. Requests that left several questions blank are flagged on the row. Requests that left several questions blank are flagged on the row.
- **Accepted & Rejected History**: Browse past reviewers, revoke accepted access if needed, or re-approve previously rejected candidates.
- **Manual Access Granting**: Directly grant access to any Hugging Face `@username` via a quick modal dialog.
- **Filtering & Search**: Real-time client-side search across names, usernames, emails, and custom gated form answers; filter by repository or repository type.
- **Repository Diagnostics**: Dedicated `/repositories` page inspecting Hugging Face connectivity, gated status (`manual` vs `auto`), and request counts per repository (with explicit `+` truncation indicators).
- **Shared Password Authentication & Rotation**: No database, no user accounts to manage, no third-party auth lock-in. Sessions are signed via stateless JWT cookies (`jose`) with cryptographic keys derived from both `AUTH_SECRET` and `APP_PASSWORD`. Updating `APP_PASSWORD` or `AUTH_SECRET` and restarting/redeploying every serving instance invalidates old sessions on those instances. Old deployments must be protected or retired separately. Logout clears the browser cookie; copied tokens remain valid until expiry or key rotation.
- **On-Demand Loading & Explicit Truncation**: Only Pending requests are loaded upon opening the dashboard. Accepted and Rejected histories load on-demand when their tabs are visited. Navigating back to a tab performs a fresh read from Hugging Face Hub so reviewer state stays in sync. When requests reach pagination limits, the UI displays explicit truncation indicators (`500+`) and a "Load more requests" button that expands the bounded history window rather than silently capping results.
- **Context-Preserving Refresh**: The global refresh button triggers a fresh fetch of the active tab while preserving your current tab, repository filters, and search query.
- **Coordinated Requests and Actions**: Tab reads use cancellation and status ownership. Mutations temporarily lock conflicting actions and tab changes, then reconcile the active list. A refused action leaves the request in the list and immediately actionable again. Failed Load More attempts preserve the committed window and remain retryable.
- **Security Hardened**: Built-in anti-clickjacking (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, timing-safe password comparison, and `Cache-Control: private, no-store` on all authenticated API responses.
- **Dark Mode Support**: Respects system theme preferences by default, with an instant toggle.

---

## Environment Variables

Configure the following variables in your deployment environment or `.env` file:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `HF_TOKEN` | **Yes** | — | Hugging Face Access Token with `write` or `admin` permissions on the managed repositories. |
| `HF_REPOSITORIES` | **Yes** | — | Comma-separated list of managed repositories in format `<type>:<owner>/<name>`. |
| `APP_PASSWORD` | **Yes** | — | Shared password used by trusted reviewers to sign in (minimum 16 characters). |
| `AUTH_SECRET` | Single instance: No; Vercel/multiple instances: **Yes** | Random in-memory key | Explicit values must have at least 32 characters. Without one, restarting invalidates all sessions. |
| `SESSION_MAX_AGE` | No | `604800` | Integer seconds from 1 to 31536000; defaults to 7 days. |
| `APP_ORIGIN` | No | HTTPS + request Host in production | Canonical public origin including port when nonstandard; no path/query/fragment. Recommended behind a proxy. |

### `HF_REPOSITORIES` Syntax
Canonical format:
```bash
HF_REPOSITORIES=model:owner/model-a,dataset:owner/dataset-b,model:org/checkpoint-c
```

Supported types:
- `model` (e.g. `model:meta-llama/Llama-2-7b`)
- `dataset` (e.g. `dataset:VL4AI/SpatialBench`)
- `space` (Configured and parsed, but see [Limitations](#limitations))

Whitespace around commas or repository names is trimmed automatically. Malformed entries are rejected when configuration is first read. Configure at most 20 repositories per deployment.

---

## Quick Start (Local Development)

### 1. Clone & Install
```bash
git clone https://github.com/ControlNet/hf-access-manager.git
cd hf-access-manager
npm install
```

### 2. Configure Environment
Create a `.env.local` file:
```bash
cp .env.example .env.local
```

Fill `.env.local` with your scoped Hugging Face token, actual repository identifiers, and a random reviewer password. For a single local or Docker instance, `AUTH_SECRET` may be omitted or left empty: the Node startup hook generates a 256-bit random key shared with its Middleware and server routes. It is kept only in process memory, never printed or saved; restarting requires reviewers to log in again. Set an explicit secret of at least 32 characters to preserve sessions across restarts, and always use the same explicit secret on Vercel or across multiple instances. Vercel startup rejects a missing secret.

The example file deliberately leaves required values empty. Keep `.env.local` private; Git and Docker exclude it. Use a password manager or secret manager to generate and store credentials.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser and enter your `APP_PASSWORD` to log in.

### 4. Run Test Suite
```bash
npm test
```

---

## Deployment

### Deploy to Vercel

The application is completely stateless and runs natively on Vercel:

1. Push your repository to GitHub / GitLab.
2. Import the project in [Vercel](https://vercel.com/new).
3. In **Settings > Environment Variables**, add:
   - `HF_TOKEN`
   - `HF_REPOSITORIES`
   - `APP_PASSWORD`
   - `AUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `SESSION_MAX_AGE` (optional)
   - `APP_ORIGIN` (recommended: your public deployment origin)
4. Click **Deploy**.

> **Note on Vercel Functions**: Because session authentication uses stateless signed JWTs, any distributed Vercel serverless instance validates requests independently without needing an external session cache or database.

Ensure your hosting plan and proxy allow at least 40 seconds per request (including body reading and upstream work). A platform deadline shorter than the application's deadlines can still produce an uncertain mutation outcome. Validate representative repository volumes before inviting reviewers.

#### Password Rotation & Invalidation on Vercel
Session tokens are cryptographically signed using a key derived from both `AUTH_SECRET` and `APP_PASSWORD`. On Vercel, serverless instances load environment variables when a deployment starts:
1. Update `APP_PASSWORD` in **Project Settings > Environment Variables**.
2. Trigger a **Redeployment** of your production deployment.
3. Because the signing key changes, all existing sessions immediately become invalid on the new deployment without requiring database or cache invalidation.

#### Vercel Deployment Protection
We recommend enabling [Vercel Deployment Protection](https://vercel.com/docs/security/deployment-protection) for preview and historical deployments. This prevents older deployment URLs (which may retain previous environment secrets) from remaining publicly accessible after a password rotation.

---

### Deploy with Docker

A production-optimized, multi-stage `Dockerfile` using Next.js standalone build is included.

#### Build the Docker image:
```bash
docker build -t hf-access-manager:latest .
```

Builds require no HF/auth environment values. Runtime credentials are injected from your private `.env.local` file; they are not build arguments.

#### Run the container:
```bash
docker run -d \
  --name hf-access-manager \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.local \
  hf-access-manager:latest
```

#### Docker Compose:
```yaml
services:
  hf-access-manager:
    image: hf-access-manager:latest
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env.local
    restart: unless-stopped
```

---

## Security Best Practices

1. **Use Fine-Grained Hugging Face Tokens**:
   - Rather than using your master Hugging Face user token, create a [Fine-Grained Token](https://huggingface.co/settings/tokens) scoped specifically to the repositories you manage with **Repository permissions: write**.
2. **Keep `APP_PASSWORD` Strong & Rotate When Needed**:
   - The shared password protects the web UI and must be at least 16 characters long.
   - When a collaborator leaves, rotate `APP_PASSWORD` and restart/redeploy every instance. Updating an environment file alone does not alter a running process. Protect or retire historical deployments that still hold the old values.
3. **Keep `AUTH_SECRET` Private & Long**:
   - When configured, use at least 32 random characters (e.g. `openssl rand -hex 32`). Without it, single-instance startup generates a temporary key; restarts invalidate existing sessions. Vercel and multi-instance deployments require an explicit shared value.
4. **HTTPS in Production**:
   - Cookies are configured with `SameSite=Lax` and `Secure` automatically in production environments. Ensure your self-hosted reverse proxy (Nginx, Caddy, Cloudflare) enforces HTTPS.
5. **Credential and PII Boundaries**:
   - Only normalized request metadata and gated-form answers are returned to reviewers. The complete upstream `raw` object is not serialized. Treat all applicant data as private.
   - Keep the token narrowly scoped even though server-side checks enforce the configured allowlist. Do not log request bodies, cookies, or authorization headers at the reverse proxy.
6. **Login and Request Abuse**:
   - Apply login throttling and request/body limits at your reverse proxy or hosting firewall. The application does not implement a distributed rate limiter.
   - Preserve the public `Host` or configure `APP_ORIGIN`; discard client-supplied forwarded headers. Keep the backend port private. Production cookies require HTTPS.
7. **Uncertain Mutation Outcomes**:
   - A timeout or lost response can occur after Hugging Face applied the action. The dashboard reconciles the current list and invalidates potentially stale counts; inspect the result before retrying. It does not automatically retry mutations.

---

## Limits and Recovery

- Pending starts at 50 pages; Accepted/Rejected start at 10. Load More expands by 10, to at most 100 pages per repository. The limit advances only after a successful load.
- Aggregation runs at most three repositories concurrently with a shared 25-second deadline. Individual upstream requests, including their bodies, have a 15-second deadline. Browser loads and actions have a 35-second deadline.
- One upstream page is limited to 1 MB; an aggregate has an 8 MB upstream body budget and a 2 MB normalized-request budget. Repositories exceeding a budget are reported as failed, not silently counted as empty. Select **Load smaller window** to recover without increasing limits. Split large workloads across deployments if a single page is too large or many repositories fail.
- Bulk requests accept 1–100 unique repository/user pairs, run at most five operations concurrently, and have a 25-second overall deadline. API JSON bodies are limited to 64 KB (login: 8 KB) with a 10-second read deadline.
- Only visited tabs have counts. Partial results use `+`; an upstream outage does not claim inbox zero or update the successful-refresh timestamp. Successful empty repositories have an explicit Pending count of zero.
- Manual grant may move an existing Pending/Rejected user. Since the API does not identify the source status or return new totals, cached counts are invalidated and recomputed on the next visit. Unknown counts are not fabricated.
- The snapshot can still change due to another reviewer or direct Hub activity. Refresh reads the source of truth; there is no cross-reviewer transaction or audit database.

## Limitations

- **Hugging Face Spaces**: Hugging Face Hub currently supports the gated access request workflow exclusively for **Models** and **Datasets**. While `space` is supported as a valid type in configuration and types, Spaces do not expose gated approval endpoints on the Hub API. The application detects this and gracefully marks Spaces as `Unsupported` on the Repositories page without affecting model or dataset management.
- **No Individual Reviewer Audit Trail**: Because this dashboard uses a shared reviewer password without individual accounts, actions are executed on the Hugging Face Hub using the configured token. Hugging Face's internal state remains the single source of truth.

---

## Continuous Integration

Every push and pull request to `master` and `main` is validated via [GitHub Actions](.github/workflows/ci.yml) running:
- **Vitest**: Unit, actual API-handler, and React component integration tests using synthetic fixtures; no live Hugging Face mutations.
- **TypeScript**: Strict typecheck (`tsc --noEmit`).
- **ESLint**: Next.js and React linting rules.
- **Next.js Standalone Build**: Production asset compilation and bundling.
- **Docker**: Multi-stage container image build and network-isolated runtime smoke checks.

Verification commands:

```bash
npm ci
npm test
npx tsc --noEmit
npm run lint
npm run build
docker build -t hf-access-manager:review .
docker run --rm -i --network none --entrypoint node hf-access-manager:review - < scripts/runtime-smoke.cjs
npm audit
```

Tests, type checking, lint, build, and runtime smoke checks should pass. `npm audit` findings require reachability review. Vitest is updated for its mock-server advisory; Next.js stays on 15.x with a same-major PostCSS override for its source-map advisories. Recheck the override on future Next.js updates.

---

## License

This project is open source and available under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
