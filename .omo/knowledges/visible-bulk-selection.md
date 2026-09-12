# Visible bulk selection (F2)

- Selection is scoped to the currently filtered request list. Search, repository,
  and repository-type changes discard selected IDs that are no longer visible.
- Clearing a filter does not restore discarded selections. Still-visible selected
  requests remain selected, preserving the existing direct-action workflow.
- `components/access-request-list.tsx` conditionally prunes selection during render
  before committing the UI. The next selection is a strict subset, so the update
  converges; no effect-delayed stale selection count is exposed.
- Bulk mutation targets are independently restricted to `filteredRequests`, using
  the existing composite IDs and pending-status check.
- `tests/access-ui.test.tsx` includes five regression cases for the three filter
  types and both bulk actions. Fixtures are synthetic; fetch is mocked and no
  Hugging Face access is changed. All five failed before the implementation fix
  and passed afterward, alongside the existing dashboard integration tests.

Verification commands (expect all tests and checks to pass):

```bash
npm test
npx tsc --noEmit
npm run lint
git diff --check
```
