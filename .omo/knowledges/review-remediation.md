# Review remediation and verification

Date: 2026-09-12

Baseline: `0fe57ccf64f59d7d0592c2787d495bb3aff25f5b`. Changes are uncommitted. This record documents implementation and observed checks, not proof that a live Hugging Face deployment has been exercised.

## Finding-to-change map

| Finding | Implemented behavior | Regression evidence |
| --- | --- | --- |
| R01: previous-tab actionable rows after failed load | Clear rows/errors/details at tab transition; status ownership guards; failed reads disable mutations | `tests/access-ui.test.tsx` |
| R02: untrusted pagination URL/redirect | Same HTTPS origin and exact endpoint path, no URL credentials/fragments, redirects rejected before following | `tests/huggingface-security.test.ts` |
| R03: failed pagination commits hard cap | Only successful reads commit the requested page allowance; failures preserve pagination and retry | `tests/access-ui.test.tsx` |
| R04: drawer closes after failed action | Parent returns confirmed success; failed actions retain drawer; stale targets are disabled | `tests/access-ui.test.tsx` |
| R05: reads and mutations race / stale grant state | Synchronous shared mutation lock, owned read controller, active-tab reconciliation, uncertain-count invalidation | `tests/access-ui.test.tsx` |
| R06: conflicting bulk/single mutations | All mutation entry points share one lock; tabs and conflicting controls disabled until reconciliation | `tests/access-ui.test.tsx` |
| R07: failed repositories treated as exact empty / incorrect timestamp | Partial counts have `+`, unknown counts stay unknown, no inbox-zero for incomplete windows, timestamp only on all-repository success | `tests/access-ui.test.tsx`, `tests/repository-ui.test.tsx` |
| R08: timeout only covers response headers | One deadline covers transport and complete body consumption; non-cooperative transport is raced against abort | `tests/huggingface-security.test.ts`, `tests/request-budget.test.ts` |
| R09: malformed successful responses treated as valid | Validate array pages, user identities, metadata, timestamp, form-field shape; surface repository errors | `tests/huggingface-security.test.ts` |
| R10: cyclic/overlapping pagination | Reject repeated page URLs; deduplicate composite request IDs | `tests/huggingface-security.test.ts` |
| R11: complete raw upstream payload sent to browser | Remove `raw`; return only normalized metadata and form fields | `tests/huggingface-security.test.ts`, `tests/huggingface.test.ts` |
| R12: Select All exceeds server batch limit | Select first 100, prevent adding beyond 100, reject duplicate canonical batch identities | `tests/access-ui.test.tsx`, `tests/api-routes.test.ts` |
| R13: unbounded streams / aggregation resource amplification | Three repository workers, five mutation workers, shared operation deadlines/body budgets, caller abort propagation, smaller-window recovery | `tests/request-budget.test.ts`, `tests/api-routes.test.ts` |
| R14: known zero Pending badge omitted | Initialize successful supported repositories to zero; failed repositories have no invented count | `tests/access-ui.test.tsx` |
| R15: environment variants can enter Git | Ignore `.env` and `.env.*`, except deliberately empty `.env.example`; Docker excludes environment files | `git check-ignore .env .env.production .env.staging .env.local .env.test` |

## Additional hardening

- API handlers and protected server pages independently validate JWTs instead of depending solely on Middleware.
- JWTs require expiration and issued-at claims, retain HS256 restriction and password/secret-derived signing keys.
- CSRF checks full origin, never `X-Forwarded-Host`; optional `APP_ORIGIN` supports a proxy that rewrites Host.
- JSON request bodies have size and read-time limits. Session ages and pagination numbers reject partial numeric parsing. Repository path traversal segments and excessive repository configurations are rejected.
- Manual grant invalidates cached counts because its response provides neither the source status nor updated totals.
- Docker builds without synthetic credential defaults. The runtime remains non-root and includes the license.
- CI runs component/route tests and a network-disabled Docker runtime smoke check. Required example environment values are empty, not ready-to-deploy sample credentials.
- Vitest moved to 4.1.11 for its advisory; PostCSS is constrained to a patched 8.x release through an override. Next.js remains 15.5.25. Reassess that override with future framework updates.

## Verified commands and signals

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
docker build -t hf-access-manager:review .
docker run --rm -i --network none --entrypoint node hf-access-manager:review - < scripts/runtime-smoke.cjs
npm audit
git diff --check
```

Observed: 201 tests passed across 16 files; typecheck, lint and production build passed; Docker performed a clean `npm ci` and built without HF/auth environment variables; isolated runtime smoke passed; npm audit reported zero vulnerabilities; whitespace checks passed. The existing `next lint` deprecation and Vite's future config-loader warning are non-failing tooling notices.

The runtime smoke script generates process-local random synthetic credentials and checks non-root execution, runtime repository configuration, authentication, allowlist rejection, forged-forwarded-host rejection, security headers, credential absence from HTML/build artifacts, password rotation without rebuilding, and logout cookie clearing. It does not contact Hugging Face. Secret scanning of tracked and untracked deliverables found no content matches. Common unrelated credential-file patterns are not all covered by `.gitignore`; the environment files this application uses are covered.

## Deliberate limits and remaining deployment responsibilities

- At most 20 configured repositories; 100 pages per repository; three concurrent repository streams; five concurrent bulk operations; 100 unique users/repository pairs per batch.
- Upstream request/body deadline: 15 seconds; overall aggregation/bulk deadline: 25 seconds; browser deadline: 35 seconds. JSON input deadline: 10 seconds.
- Per-page body: 1 MB; shared upstream body budget: 8 MB; normalized aggregate request data: 2 MB. Budget failures are visible, not silently counted as empty.
- Configure HTTPS, a canonical origin or preserved public Host, private backend networking, and edge/proxy login throttling. Allow enough hosting runtime for the application's deadlines.
- Rotate credentials by restarting/redeploying every serving instance; separately protect or retire historical deployments. Logout cannot revoke a copied stateless JWT by itself.
- No production token, real applicant information, live mutation, or Vercel deployment was used in verification. Validate the token's actual permissions and representative volumes in a controlled deployment.
- Wire-format tests cover official model/dataset handle and grant contracts, including cancellation via `status: "pending"`. They are not live API conformance tests. References: https://huggingface.co/docs/hub/models-gated and https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/hf_api.py.
