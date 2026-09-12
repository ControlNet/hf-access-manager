# `hf-access-manager`

> A minimal, stateless, self-hosted dashboard for delegating Hugging Face gated repository access management without sharing the repository owner's Hugging Face token.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
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
- **Fail-Safe & Isolated**: A failure or rate limit on one repository never interrupts management of the others.
- **Production-Ready**: Deployable to Vercel in 60 seconds or self-hostable using Docker.

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
- CSRF origin and host verification protects mutation endpoints.

---

## Features

- **Unified Inbox Queue**: Review pending requests across all your configured models and datasets from one view.
- **One-Click Actions**:
  - **Approve**: Instant approval with immediate optimistic UI update.
  - **Reject**: 1-click rejection without dialogue or justification prompts. Mistakes can be undone anytime from the *Rejected* tab.
- **Bulk Actions**: Check multiple pending requests to bulk-approve or bulk-reject concurrently (with rate-limiting safety).
- **Dynamic Gated Form Rendering**: Automatically parses and displays arbitrary gated questions (affiliation, supervisor, country, intended use case, terms) without requiring code changes if questions are updated.
- **Accepted & Rejected History**: Browse past reviewers, revoke accepted access if needed, or re-approve previously rejected candidates.
- **Manual Access Granting**: Directly grant access to any Hugging Face `@username` via a quick modal dialog.
- **Filtering & Search**: Real-time client-side search across names, usernames, emails, and custom gated form answers; filter by repository or repository type.
- **Repository Diagnostics**: Dedicated `/repositories` page inspecting Hugging Face connectivity, gated status (`manual` vs `auto`), and request counts per repository.
- **Shared Password Authentication & Instant Invalidation**: No database, no user accounts to manage, no third-party auth lock-in. Sessions are signed via stateless JWT cookies (`jose`) with cryptographic keys derived from both `AUTH_SECRET` and `APP_PASSWORD`. Rotating `APP_PASSWORD` immediately invalidates all existing reviewer sessions across all instances without requiring external cache or database state.
- **On-Demand Loading & Explicit Truncation**: Only Pending requests are loaded upon opening the dashboard. Accepted and Rejected histories load lazily on-demand when their tabs are visited. When requests hit pagination boundaries, the UI displays explicit truncation indicators (`500+`) with a "Load more requests" button rather than silently capping results.
- **Race-Safe Tab Transitions**: Tab switching and unmounts utilize `AbortController` cancellation to prevent in-flight requests from overwriting the active view with stale data.
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
| `AUTH_SECRET` | **Yes** | — | Secret string (minimum 32 characters) used to sign and verify session JWT cookies. |
| `SESSION_MAX_AGE` | No | `604800` | Session lifetime in seconds (defaults to 7 days). |

### `HF_REPOSITORIES` Syntax
Canonical format:
```bash
HF_REPOSITORIES=model:owner/model-a,dataset:owner/dataset-b,model:org/checkpoint-c
```

Supported types:
- `model` (e.g. `model:meta-llama/Llama-2-7b`)
- `dataset` (e.g. `dataset:VL4AI/SpatialBench`)
- `space` (Configured and parsed, but see [Limitations](#limitations))

Whitespace around commas or repository names is trimmed automatically. Malformed entries are rejected at startup with informative error messages.

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

Edit `.env.local` with your credentials:
```bash
HF_TOKEN=hf_yourWriteTokenHere
HF_REPOSITORIES=model:your-org/your-model,dataset:your-org/your-dataset
APP_PASSWORD=choose-a-strong-reviewer-password
AUTH_SECRET=generate-a-random-secret-at-least-32-characters-long
```

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
4. Click **Deploy**.

> **Note on Vercel Functions**: Because session authentication uses stateless signed JWTs, any distributed Vercel serverless instance validates requests independently without needing an external session cache or database.

---

### Deploy with Docker

A production-optimized, multi-stage `Dockerfile` using Next.js standalone build is included.

#### Build the Docker image:
```bash
docker build -t hf-access-manager:latest .
```

#### Run the container:
```bash
docker run -d \
  --name hf-access-manager \
  -p 3000:3000 \
  -e HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxx" \
  -e HF_REPOSITORIES="model:owner/model-a,dataset:owner/dataset-b" \
  -e APP_PASSWORD="your-shared-password" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  hf-access-manager:latest
```

#### Docker Compose:
```yaml
version: "3.8"

services:
  hf-access-manager:
    image: hf-access-manager:latest
    build: .
    ports:
      - "3000:3000"
    environment:
      - HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
      - HF_REPOSITORIES=model:owner/model-a,dataset:owner/dataset-b
      - APP_PASSWORD=your-shared-password
      - AUTH_SECRET=your-random-secret-at-least-32-characters
      - SESSION_MAX_AGE=604800
    restart: unless-stopped
```

---

## Security Best Practices

1. **Use Fine-Grained Hugging Face Tokens**:
   - Rather than using your master Hugging Face user token, create a [Fine-Grained Token](https://huggingface.co/settings/tokens) scoped specifically to the repositories you manage with **Repository permissions: write**.
2. **Keep `APP_PASSWORD` Strong & Rotate When Needed**:
   - The shared password protects the web UI and must be at least 16 characters long.
   - When a collaborator leaves or access needs to be revoked, simply rotate `APP_PASSWORD`. All active reviewer sessions are immediately invalidated across all deployment instances without database state.
3. **Keep `AUTH_SECRET` Private & Long**:
   - Ensure `AUTH_SECRET` is at least 32 random characters (e.g. `openssl rand -hex 32`).
4. **HTTPS in Production**:
   - Cookies are configured with `SameSite=Lax` and `Secure` automatically in production environments. Ensure your self-hosted reverse proxy (Nginx, Caddy, Cloudflare) enforces HTTPS.
5. **No Token Leakage**:
   - `HF_TOKEN` is never sent to the client, never logged in API responses, and never accessible via browser developer tools.

---

## Limitations

- **Hugging Face Spaces**: Hugging Face Hub currently supports the gated access request workflow exclusively for **Models** and **Datasets**. While `space` is supported as a valid type in configuration and types, Spaces do not expose gated approval endpoints on the Hub API. The application detects this and gracefully marks Spaces as `Unsupported` on the Repositories page without affecting model or dataset management.
- **No Individual Reviewer Audit Trail**: Because this dashboard uses a shared reviewer password without individual accounts, actions are executed on the Hugging Face Hub using the configured token. Hugging Face's internal state remains the single source of truth.

---

## License

This project is open source and available under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).