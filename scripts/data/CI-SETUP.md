# CI Setup — Playwright Smoke Test

The `.github/workflows/e2e.yml` workflow runs a single Playwright smoke test
against the live Cloudflare Workers deployment on every PR to `main` and on
every push to `main`. The test logs in, verifies the Projects page, opens
the Add-to-Cart modal on the Products page, and exits. It takes ~30–60s.

## 1. Create the E2E test user

The smoke test needs a real user account. Use the `bootstrap-user` admin
endpoint (defined in `worker/index.ts`). It's gated by a static token
(`asafe-engage-reset-2026`) — OK as-is for a dev helper, but rotate the
token after onboarding if the value has been committed widely.

```bash
# Replace the domain if running against a preview deployment.
# Use a strong password — leaked creds on a public repo = takeover.
curl "https://asafe-engage.tom-d-g-childs.workers.dev/api/bootstrap-user\
?token=asafe-engage-reset-2026\
&email=e2e-test@asafe.ae\
&password=REPLACE-WITH-A-STRONG-PASSWORD\
&firstName=E2E\
&lastName=Test\
&role=user"
```

Expected response:

```json
{ "success": true, "action": "created", "email": "e2e-test@asafe.ae", ... }
```

If the user already exists the endpoint returns `"action": "updated"` and
rotates the password to whatever you passed in — useful for rotating the
credential between CI seasons.

## 2. Add the secrets to GitHub Actions

In the repository settings, go to **Settings → Secrets and variables →
Actions → New repository secret** and add:

| Name           | Value                                  |
| -------------- | -------------------------------------- |
| `E2E_EMAIL`    | `e2e-test@asafe.ae`                    |
| `E2E_PASSWORD` | (the password you used in step 1)      |

`E2E_BASE_URL` is set inline in the workflow and points at the live
deployment. No extra secret required for it.

## 3. Running the smoke test locally

From the repo root:

```bash
npm ci
npx playwright install --with-deps chromium
E2E_EMAIL=e2e-test@asafe.ae \
E2E_PASSWORD=... \
E2E_BASE_URL=https://asafe-engage.tom-d-g-childs.workers.dev \
  npm run test:e2e
```

Artifacts (HTML report, traces, screenshots on failure) land in
`playwright-report/`. The CI job uploads this folder as an artifact on
every run, regardless of pass/fail.

## 4. What the smoke test covers (and doesn't)

Covers:

- Public landing renders with a Sign In CTA
- Login round-trip succeeds against the live DB + Worker
- `/projects` renders and the "+ New project" button is present
- `/products` renders and a product card can open the Add-to-Cart modal

Out of scope:

- Creating a project (would pollute the prod DB with a garbage row every
  commit). Use a dedicated staging deployment if you want end-to-end
  create flows.
- PDF generation / download bytes checks — run these ad-hoc locally.
- Browser compatibility beyond Chromium.

## 5. Failure triage

When the smoke test fails:

1. Open the failed run → download the `playwright-report` artifact.
2. Open `index.html` in a browser — you get traces, screenshots, and a
   per-step breakdown.
3. Most false-positives are auth-related (test user password rotated,
   session secret rotated). Re-run step 1 above to repave the user.
4. If the modal assertion fails, diff recent commits under
   `client/src/components/AddToCartModal.tsx` and
   `client/src/pages/Products.tsx` — the test relies on the stable
   `data-testid="button-add-to-cart-<id>"` and
   `data-testid="modal-add-to-cart-<id>"` conventions.
