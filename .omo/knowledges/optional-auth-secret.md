# Optional AUTH_SECRET for a single server instance

Implemented and verified on 2026-09-12.

- Missing or empty `AUTH_SECRET` generates 32 cryptographically random bytes encoded as 64 hexadecimal characters.
- `instrumentation.ts` initializes it during Node server startup, before the self-hosted Edge middleware sandbox is created. The generated value is assigned only to the process environment so Middleware, page authentication, and API handlers use the same key. `getEnv()` also initializes it for direct server-library use.
- The secret is not generated in Edge instrumentation or production-build instrumentation. A fixed warning explains the temporary-session behavior without logging the value. No secret file is written.
- Repeated initialization/configuration-cache resets reuse the value. Explicit secrets remain unchanged and must contain at least 32 characters. Password-derived signing and existing JWT validation remain intact.
- Restarting without an explicit value creates a new key and invalidates old sessions. Vercel rejects a missing value because separate Edge/functions cannot share process-local randomness. Other multi-instance deployments must explicitly configure the same key on every instance.
- No Middleware authentication bypass or server-side authorization relaxation was introduced.

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
git diff --check
```

Observed: 212 tests passed in 17 files; typecheck, lint and whitespace checks passed. Synthetic tests cover absent/empty/provided/short secrets, reuse, fresh-key and password invalidation, startup/build/Edge conditions, Vercel rejection, and actual mutation-handler authorization.

The Docker production build and network-isolated runtime smoke passed. The smoke script now also verifies login without an explicit secret, agreement between Middleware and server-page verification, authenticated allowlist checks in all four mutation handlers, and rejection of old cookies after a restart with another automatically generated key.

The review image was built from tracked files plus the three new implementation/test files to exclude unrelated untracked files and private environment files:

```bash
git ls-files -z | tar --null -T - -cf - instrumentation.ts lib/runtime-auth-secret.ts tests/auth-secret.test.ts | docker build -t hf-access-manager:optional-auth-review -
docker run --rm -i --network none --entrypoint node hf-access-manager:optional-auth-review - < scripts/runtime-smoke.cjs
```

Credential scanning of this task's deliverables found no matches. No real HF token, live Hub mutation, or user service restart was used. Changes were not committed or pushed as part of this task.

Framework reference: https://nextjs.org/docs/15/app/api-reference/file-conventions/instrumentation. The installed Next.js 15.5.25 sandbox code copies the Node process environment when creating the self-hosted Edge runtime; the Docker smoke verifies that behavior end to end.
