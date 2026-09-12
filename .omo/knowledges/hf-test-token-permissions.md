# Hugging Face token permissions for testing

Verified against official documentation on 2026-09-12.

- Use a fine-grained User Access Token restricted to the actual model/dataset repositories configured in `HF_REPOSITORIES`.
- Official gated-model and gated-dataset documentation requires write access to the gated repository for listing and managing access requests. A download-only/read token is insufficient.
- In the selected-repository permissions, grant repository read and write access; avoid account-wide or organization-wide grants. The token creator must already have the required repository permissions; token scopes cannot elevate the account's access.
- The dashboard does not need Inference, billing, Jobs, webhook, or organization-member administration permissions.
- Enable manual gating on a controlled test repository to exercise the Pending workflow. Actual token permissions and organization token policies still require live verification; no live token was supplied during this check.
- Store the credential only in private server environment configuration or `.env.local`, never in chat, browser configuration, source code, or logs. The repository ignores `.env` and `.env.*` except `.env.example`; arbitrary files such as `token.json` are not ignored.
- The authenticated token-creation screen was not accessible during documentation verification, so its exact current checkbox wording was not independently inspected.
- The user subsequently supplied a permission list with a separate `View access requests for your gated repos` option. For complete dashboard testing, cover repository read, access-request viewing, and repository write permissions. Do not assume the documentation's generic write wording proves that write subsumes this separately exposed view scope. Prefer equivalent selected-repository grants; personal `your repos` grants may be broader than the dashboard allowlist.

Sources:

- https://huggingface.co/docs/hub/models-gated
- https://huggingface.co/docs/hub/datasets-gated
- https://huggingface.co/docs/hub/security-tokens
