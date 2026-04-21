# Security Setup — Runbook

Ops steps to provision the optional security-hardening features of
A-SAFE Engage. Every feature here is **gracefully optional** — the app
boots and serves traffic with any subset disabled. Provision them one
at a time as needed.

---

## Cloudflare Turnstile (human verification)

Turnstile gates the public auth endpoints against scripted abuse:
`/api/login`, `/api/register`, `/api/admin/login`,
`/api/auth/forgot-password`, `/api/auth/reset-password`.

If either key below is missing, verification is skipped and a single
`[turnstile] …` WARN line is logged per isolate. The client widget
hides itself automatically when the site key isn't served via
`/api/config`.

### 1. Create a Turnstile site in the CF dashboard

Cloudflare Dashboard → Turnstile → **Add Site**. Set the domain to
`asafe-engage.tom-d-g-childs.workers.dev` (and `localhost` for dev).
Copy both the **site key** (starts with `0x4AAAAAAA…`) and **secret
key** (starts with `0x4AAAAAAAB…`).

### 2. Publish the site key (public)

Either edit `wrangler.toml` under `[vars]`:

```toml
[vars]
TURNSTILE_SITE_KEY = "0x4AAAAAAA..."
```

Or ship it inline with a deploy:

```sh
wrangler deploy --var TURNSTILE_SITE_KEY=0x4AAAAAAA...
```

### 3. Set the secret key (private, never committed)

```sh
echo '0x4AAAAAAAB...' | wrangler secret put TURNSTILE_SECRET_KEY
```

### 4. Verify

- `curl https://asafe-engage.tom-d-g-childs.workers.dev/api/config`
  should return `{"turnstileSiteKey":"0x4AAAAAAA..."}`.
- Load the landing page and open the Sign In dialog. The Turnstile
  widget renders above the submit button; the button stays disabled
  until the challenge resolves.
- Tail worker logs with `wrangler tail`; a failed challenge logs
  `[turnstile] verify failed for /login ip=… reason=…`.

### 5. Rotating

- Rotate the secret: re-run `wrangler secret put TURNSTILE_SECRET_KEY`.
- Rotate the site key: update `wrangler.toml` and redeploy. Old tokens
  issued against the previous key are rejected by `siteverify`.
