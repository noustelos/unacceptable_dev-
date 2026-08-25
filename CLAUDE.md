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
- Greenfield. Nothing built yet.
- [ ] Repo init: `.gitignore`, this `CLAUDE.md`, remote, first commit.
- [ ] Confession terminal frontend: intro, hero, textarea, two CTAs.
- [ ] VOID path (frontend-only, zero network).
- [ ] BLOG path: handle + Turnstile + `POST /api/confess`.
- [ ] `functions/api/confess.js`: validate → Turnstile → email to owner.
