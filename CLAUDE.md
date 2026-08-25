# CLAUDE.md — The Unacceptable Universe

> **Repo:** `unacceptable.dev` — the INPUT half. (Sibling repo `notso.dev` is the OUTPUT half. This line is `unacceptable.dev` — do not let it say `notso.dev`.)

Shared source of truth for the concept. Two **separate** repos on purpose (data siloing). Separate repos, Pages projects, secrets, Turnstile widgets, analytics. The only bridge between the two sites is a URL redirect and the owner's hands — **no shared backend, no shared secrets, no cross-import.** A moderation email to the owner's inbox is a human notification, not a data coupling.

## What this is
The confession terminal of a two-domain satirical portal for **vibe coders**. Dry sarcasm, minimal aesthetic. A mechanism, not a spectacle.

One symmetric visual joke, no docs needed:
```
acceptable.dev → unacceptable.dev     so.dev → not so.dev
```
Read in 3 seconds or it failed.

## Tone spine (non-negotiable)
**Mock the machine, protect the human.** Sarcasm targets tools, buzzwords, cloud providers, industry hype — never the user. Teasing, never condescending or judgmental. Cynical on the outside, kind underneath.

## The loop
| Domain | Role |
|---|---|
| **unacceptable.dev** (this repo) | INPUT — the confession terminal |
| **notso.dev** | OUTPUT — the feed + Uncle Dev bot |

## The confession terminal — spec
- **Intro (minimal, one-shot):** `acceptable.dev !` settles, then the `un` prefix fades in front → `unacceptable.dev !`. This mirrors notso's `not` prefix.
  - **One-shot fade to a resting state. NO looping/breathing pulse.** (notso proved a continuous opacity loop on a large element reads as *flicker* at every amplitude/speed — it was cut for a one-shot fade to a resting opacity. Do the same here.)
  - Skippable; the `prefers-reduced-motion` state is pixel-identical to the animated end state, minus the fade.
- **Hero line:** `// Society is glitching. Report the bug.`
- **Confession box:** a textarea. Placeholder: `[ Describe the unacceptable behavior / incident / bug... ]`
- **Two CTAs — different mechanisms:**
  - **SEND TO VOID** — zero record, **no network call at all**. The text is discarded client-side; show `// Error logged successfully. You are now clean.` Catharsis is the product. No Turnstile, no backend, no cost, no moderation, no privacy surface.
  - **SEND TO BLOG** — candidate feed content. Requires an optional **handle** (Discord / socials — display-only, unverified, NOT an account) and a solved **Turnstile**. POSTs to `/api/confess`. The confession goes in the **POST body — never a URL param.**
- **Contact:** `human@unacceptable.dev`, wrapped in `<!--email_off-->…<!--/email_off-->` (see Gotchas).

## Moderation flow (git-based, no database)
`SEND TO BLOG` → `/api/confess` Function → Turnstile verify (server-side) → email the submission to the owner's inbox → owner reads, decides by hand → owner pastes approved ones into the **notso.dev** repo as feed entries → push → live. The owner is the queue. No AI scanner, no admin UI, no DB.

## Tech & stack
- Static-first, **Cloudflare Pages**, Git-connected (push → auto-deploy). Connect via the **classic Pages flow** (`/pages/new/provider/github`), NOT the unified "Create application" flow (that one demands a `wrangler.toml` a static site does not need). Build command empty, output directory `/`.
- One Function: `functions/api/confess.js`. That is the only dynamic piece. No KV, no D1, no database.
- **Email:** Cloudflare Email Service (native REST) preferred — verify the current endpoint, domain-onboarding steps, and token scope against the live Cloudflare Email Service docs before coding (it is new and changing). Resend is the documented fallback. Send FROM a verified sender on an onboarded domain, TO the owner's inbox.
- **Turnstile:** this site's OWN widget/keys — do NOT reuse notso.dev's. Secret is a Pages **secret**; sitekey is public in HTML.
- Secrets read from env bindings, never hardcoded, never committed.

## Accessibility (hard rule)
Honour the real OS `prefers-reduced-motion` silently and correctly. Calm from the first frame for anyone who set it. No effect ever overrides a real accessibility preference.

## Gotchas (hard-won — respect them)
- **Turnstile: `defer`, never `async`.** With `async`, `api.js` runs mid-parse before the container exists and never re-scans.
- **Never give an element `id="turnstile"`.** An element id becomes `window.<id>`, so `<div id="turnstile">` overwrites `window.turnstile` and the widget silently dies with a misleading "already loaded" warning. Use `#ts-widget`.
- **Turnstile tokens are single-use.** Reset the widget after any submit that consumes one, or a second attempt 403s.
- **`siteverify`: parse the JSON body even when `res.ok` is false.** `400 invalid-input-secret` = the stored SECRET is wrong (e.g. a sitekey pasted in). `200 invalid-input-response` = secret is CORRECT, the token is bad/expired/reused. A bad token never yields 400.
- **sitekey = 24 chars, secret = 35 chars.** Only the 24-char one is safe in `index.html`. Localhost shows Turnstile `110200` (unknown domain) — expected; use Cloudflare's always-pass test keys in a gitignored `.dev.vars` for local layout work.
- **Pages secrets bind at BUILD time; Production and Preview are SEPARATE stores.** A missing Preview secret 500s *identically* to a wrong key. Redeploy after adding/rotating any secret. The first preview branch 500s until Preview gets its own copies.
- **Email Address Obfuscation (Scrape Shield) is ON by default** and rewrites any address it finds into `[email protected]` on the live domain (not locally). Wrap every displayed address in `<!--email_off-->…<!--/email_off-->`.
- **`_headers`/CSP fails silently and only in production** (localhost does not read `_headers`). If you add a CSP, ship it in the SAME commit as the feature it must allow, and include the Turnstile + email-endpoint origins. Never `'unsafe-inline'` on `script-src`.
- **`position:fixed` breaks under a transformed ancestor.** Any ancestor with a non-`none` `transform` (including a reveal animation parked by `animation-fill-mode: forwards`) becomes the containing block. Make any fixed element (e.g. a floating Turnstile badge) a **direct child of `<body>`**.
- **macOS 12.6 machine: `wrangler pages dev` cannot run** (`workerd` needs macOS 13.5+). Test the handler logic under Node and verify against production after secrets are set. There is no local Pages/Worker runtime here.
- **push to `main` = instantly live, no staging.** Work on a branch, local preview (`python3 -m http.server`) is the only pre-deploy gate, merge when ready, then hard-refresh + verify live.
- **Everything in this repo is publicly readable at the live domain and on public GitHub.** No secrets, no private reasoning about named people. `LESSONS.md` must NEVER be committed here (it is globally gitignored — keep it that way).

## Anti-goals (protect against overengineering)
- VOID needs no backend — do not build one for it.
- No database. The owner is the moderation queue. No AI scanner, no admin UI.
- No mascot on-site until the Dave Notso sketch is final.
- Do not reuse notso.dev's Turnstile keys, secrets, or analytics. Do not import or fetch across the two sites.

## Workflow
`Brainstorm → Architecture → Strategy → Preview → Commit & Push.`
Review output as: **Urgent Fixes / Quality / Nice-to-have / Monetization.**

---

## Current status — unacceptable.dev (this repo)
Terminal is built and pushed to `main`. Not live: there is no Pages project yet,
no secrets, no onboarded domain. Everything left is human-side dashboard work.

- [x] Repo init: `.gitignore`, this `CLAUDE.md`, remote, first commit. — `ce00575`
- [x] Confession terminal frontend: intro (`un` one-shot, no pulse), hero,
      textarea, two CTAs. — `0da32a7`
- [x] VOID path (frontend-only, **zero network — verified**: the only `fetch` in
      `index.html` is the BLOG button's, and there is no `XMLHttpRequest` or
      `sendBeacon` anywhere in the file). — `0da32a7`
- [x] BLOG path: optional handle + Turnstile (`defer`, `#ts-widget`, body-level,
      `reset()` after every submit) + `POST /api/confess`. — `9f8c63f`
- [x] `functions/api/confess.js`: validate → server-side siteverify → email to
      owner. Native Cloudflare Email Service preferred, Resend as automatic
      fallback; native wins when both are bound. 13/13 mocked cases pass under
      Node (no email is sent on any reject path). — `9735356`

Blocked on human (dashboard — see Handoff below):
- [ ] `human@unacceptable.dev` inbox exists
- [ ] Pages project connected (classic flow)
- [ ] Turnstile keys: sitekey into `index.html`, secret into Pages (Prod + Preview)
- [ ] Email credential + `CONFESS_TO` (Prod + Preview)
- [ ] Domain onboarding for Email Sending (only if going native)
- [ ] First production email test

### Known limitation — the rate limit is not real yet
The 5-per-minute-per-IP throttle in `functions/api/confess.js` is an **in-memory
counter inside the Function** — a module-scope `Map` in isolate memory. There is
no Rate Limiting binding and no dashboard rule behind it.

**It does not hold in production.** The counter is per-isolate and per-colo, so
each isolate keeps its own tally and Cloudflare may run many of them: the real
ceiling is 5/min × however many isolates happen to serve the caller, and every
count resets whenever an isolate is recycled. Treat it as a speed bump in front
of one inbox, never as a guarantee.

The fix is a **Cloudflare Rate Limiting rule on `/api/confess`**, which counts at
the edge across the whole colo. Turnstile is the actual spam gate; this is only
cost protection on the email path. Do not "harden" the in-memory version — it
cannot be made global — and do not add KV or D1 to back it (no database is a
hard anti-goal). Replace it, or accept it as-is and delete it.

---

## Handoff — next session

### Human-side (dashboard) — all unblocked, do in this order
a. **Stand up `human@unacceptable.dev`** so `CONFESS_TO` lands somewhere real.
   `oops@notso.dev` is the confirmed-working address; `human@` is new and has
   never received anything. Until it exists, a perfectly working Function
   delivers into a void that is not the fun kind.
b. **Connect Cloudflare Pages** via the **classic flow**
   (`/pages/new/provider/github`) — NOT the unified "Create application" flow,
   which demands a `wrangler.toml` this static site does not have and does not
   need. Framework preset **None**, build command **empty**, output directory
   **`/`**.
c. **New Turnstile widget for unacceptable.dev** — its own, never notso.dev's
   (siloing). The 24-char **sitekey** replaces `REPLACE_ME` in `index.html`
   (one constant, top of the inline script). The 35-char **secret** becomes the
   `TURNSTILE_SECRET_KEY` Pages secret, in **Production AND Preview** — they are
   separate stores, and a missing Preview copy 500s identically to a wrong key.
d. **Pick ONE email path — never both.** The account is Workers Paid, so native
   is available, and there is also a Resend account.
   - Native: `CF_EMAIL_TOKEN` (API token with **Email Sending: Edit**) +
     `CF_ACCOUNT_ID`, and onboard the domain under
     Compute → Email Service → Email Sending (adds `cf-bounce` MX + SPF/DKIM/DMARC).
   - Resend: `RESEND_API_KEY` alone.
   Set `CONFESS_TO` too. All of it in **Production AND Preview**, then redeploy —
   Pages binds secrets at BUILD time.
e. **Live-test the BLOG submit.** This is the first real email test: there is no
   local Workers runtime on this machine (`wrangler pages dev` needs macOS 13.5+),
   so delivery has only ever been exercised against mocks.
f. **Live source check.** Confirm Scrape Shield left `human@unacceptable.dev`
   alone inside its `<!--email_off-->` markers (it rewrites addresses on the live
   domain only, never locally), and confirm the confession appears nowhere in the
   URL — body only.

### Agent-side, first thing next session
g. Move the rate limit off the in-memory counter and onto a **Cloudflare Rate
   Limiting rule on `/api/confess`** — see "Known limitation" above. This is the
   one code change already known to be needed.
