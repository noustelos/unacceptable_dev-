/**
 * unacceptable.dev — POST /api/confess
 *
 * Cloudflare Pages Function. Same origin as the site, so no CORS is needed and
 * none is granted. This is the ONLY dynamic piece on the site: no KV, no D1,
 * no database. The owner's inbox is the moderation queue.
 *
 * Flow: validate input -> verify Turnstile server-side -> email the owner.
 * Email is NEVER sent before Turnstile passes. That order is the whole cost
 * and spam gate on a box with no sign-up.
 *
 * The SEND TO VOID button never reaches this file. It has no network call at
 * all — do not add one, and do not "unify" the two paths.
 *
 * Secrets (encrypted env vars, Cloudflare Pages dashboard — set them for
 * Production AND Preview, they are separate stores):
 *   TURNSTILE_SECRET_KEY          required
 *   CF_EMAIL_TOKEN + CF_ACCOUNT_ID    native Cloudflare Email Service (preferred)
 *   RESEND_API_KEY                    fallback, used only if the native pair is absent
 * Plain vars (not secret, but still env — never hardcode an address here):
 *   CONFESS_TO      default human@unacceptable.dev
 *   CONFESS_FROM    default terminal@unacceptable.dev  (must be on an onboarded domain)
 */

const SITEVERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/* Cloudflare Email Service — Email Sending, REST API. Verified against the
   live docs on 2026-08-25:
     POST /accounts/{account_id}/email/sending/send
     Authorization: Bearer <API token with "Email Sending: Edit">
     body { to, from, subject, html, text }
     200  -> { success, errors, messages, result:{ delivered, permanent_bounces, queued } }
   Requirements that live OUTSIDE this code: the account is on Workers Paid,
   the domain is onboarded under Compute > Email Service > Email Sending (which
   adds cf-bounce MX + SPF/DKIM/DMARC records), and the domain uses Cloudflare
   DNS. Until then this call fails and the fallback below matters. */
const CF_EMAIL_ENDPOINT = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

const MAX_CONFESSION_CHARS = 2000;
const MAX_HANDLE_CHARS = 60;

const TURNSTILE_TIMEOUT_MS = 10000;
const EMAIL_TIMEOUT_MS = 15000;

const DEFAULT_TO = "human@unacceptable.dev";
const DEFAULT_FROM = "terminal@unacceptable.dev";

/* Best-effort per-IP throttle on top of Turnstile. Isolate memory only — no
   KV, no D1, and Cloudflare may run many isolates, so this is a speed bump
   protecting one inbox, not a guarantee. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60000;
const hits = new Map();

/* In character even when refusing. Sarcasm points at the machine, never at
   the person who just typed something honest into a box. */
const VOICE = {
  method: "// Wrong door. This one only takes POST.",
  origin: "// We only take reports filed from our own terminal.",
  badBody: "// That request arrived scrambled. Send it again.",
  empty: "// You have to actually report something. Empty is the void's job.",
  tooLong:
    `// That's a manifesto, not a bug report. Trim it under ${MAX_CONFESSION_CHARS} characters.`,
  turnstile:
    "// The bot-check didn't recognise you. Reload the page and file it again.",
  rateLimit:
    "// Easy. Society will still be glitching in a minute. Try again then.",
  misconfigured:
    "// Our wiring is loose on this end — not your fault. Try again in a bit.",
  upstream:
    "// The report didn't make it to the human. Nothing was saved. Try again in a sec.",
};

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const bucket = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  bucket.push(now);
  hits.set(ip, bucket);
  if (hits.size > 5000) hits.clear(); // crude ceiling, memory is not ours to hoard
  return bucket.length > RATE_LIMIT_MAX;
}

/* Returns { ok, codes }. Cloudflare names the exact fault in error-codes and
   the distinction matters:
     400 invalid-input-secret   -> the STORED SECRET is wrong (a sitekey pasted
                                   into the secret slot does exactly this)
     200 invalid-input-response -> secret is CORRECT, the token is bad/expired
     200 timeout-or-duplicate   -> the token was already spent
   A bad token never yields 400, so the status alone misdiagnoses it. And the
   body is useful even when res.ok is false — parse it regardless. */
async function turnstilePasses(token, ip, secret) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const res = await fetch(SITEVERIFY_ENDPOINT, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!data) return { ok: false, codes: ["siteverify-http-" + res.status] };
  return { ok: data.success === true, codes: data["error-codes"] || [] };
}

/* Native first, Resend only if the native pair is absent. Returns
   { ok, via, detail } — detail is for the LOG, never for the caller. */
async function sendEmail(env, { to, from, subject, text, html }) {
  if (env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID) {
    const res = await fetch(CF_EMAIL_ENDPOINT(env.CF_ACCOUNT_ID), {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_EMAIL_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ to, from, subject, text, html }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });

    /* Same rule as siteverify: the body carries the real reason on a non-2xx
       (E_SENDER_NOT_VERIFIED, an un-onboarded domain, a token missing the
       Email Sending: Edit permission). Parse it either way. */
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }

    if (res.ok && data?.success === true) return { ok: true, via: "cf-email" };
    return {
      ok: false,
      via: "cf-email",
      detail: `http ${res.status} ${JSON.stringify(data?.errors || [])}`,
    };
  }

  if (env.RESEND_API_KEY) {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ to: [to], from, subject, text, html }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, via: "resend" };
    return { ok: false, via: "resend", detail: `http ${res.status}` };
  }

  return { ok: false, via: "none", detail: "no email credential bound" };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  /* Same-origin only. A cross-origin JSON POST is preflighted and we answer no
     OPTIONS, but reject explicitly too. */
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return json({ error: VOICE.origin }, 403);
      }
    } catch {
      return json({ error: VOICE.origin }, 403);
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: VOICE.badBody }, 400);
  }

  const confession =
    typeof payload?.confession === "string" ? payload.confession.trim() : "";
  const handle =
    typeof payload?.handle === "string"
      ? payload.handle.trim().slice(0, MAX_HANDLE_CHARS)
      : "";
  const turnstileToken =
    typeof payload?.turnstileToken === "string" ? payload.turnstileToken : "";

  /* Validation first: a malformed request costs nothing and sends no email. */
  if (!confession) return json({ error: VOICE.empty }, 400);
  if (confession.length > MAX_CONFESSION_CHARS) {
    return json({ error: VOICE.tooLong }, 400);
  }

  const hasEmailCredential =
    (env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID) || env.RESEND_API_KEY;
  if (!env.TURNSTILE_SECRET_KEY || !hasEmailCredential) {
    /* Names only, never values — and only to the log, never to the caller.
       Pages binds secrets at BUILD time, and Production and Preview are
       separate stores: add them, then redeploy. A missing Preview secret
       fails identically to a wrong key. */
    console.error(
      "confess: missing binding(s):",
      [
        !env.TURNSTILE_SECRET_KEY && "TURNSTILE_SECRET_KEY",
        !hasEmailCredential && "CF_EMAIL_TOKEN+CF_ACCOUNT_ID or RESEND_API_KEY",
      ].filter(Boolean).join(", "),
      "— redeploy after adding",
    );
    return json({ error: VOICE.misconfigured }, 500);
  }

  if (!turnstileToken) return json({ error: VOICE.turnstile }, 403);

  let verdict = { ok: false, codes: ["verify-threw"] };
  try {
    verdict = await turnstilePasses(turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  } catch (err) {
    verdict = { ok: false, codes: ["verify-threw-" + (err?.name || "error")] };
  }
  if (!verdict.ok) {
    /* Logged, never returned: these codes describe server configuration and
       belong in the log, not in a public response. */
    console.error("confess: turnstile rejected:", verdict.codes.join(","));
    return json({ error: VOICE.turnstile }, 403);
  }

  /* Throttle only after Turnstile, so a failed challenge cannot burn a slot. */
  if (rateLimited(ip)) return json({ error: VOICE.rateLimit }, 429);

  const to = env.CONFESS_TO || DEFAULT_TO;
  const from = env.CONFESS_FROM || DEFAULT_FROM;
  const who = handle || "anonymous";
  const stamp = new Date().toISOString();

  const text =
    `NEW CONFESSION — unacceptable.dev\n` +
    `handle: ${who}   (display-only, unverified — NOT an account)\n` +
    `filed:  ${stamp}\n` +
    `chars:  ${confession.length}\n` +
    `\n---\n\n${confession}\n\n---\n` +
    `\nApprove by pasting it into the notso.dev repo as a feed entry. ` +
    `Nothing is stored on this side.\n`;

  const html =
    `<pre style="font:14px ui-monospace,Menlo,monospace;white-space:pre-wrap">` +
    escapeHtml(text) +
    `</pre>`;

  let result;
  try {
    result = await sendEmail(env, {
      to,
      from,
      /* The handle is safe in a subject line; the confession is not — it never
         leaves the body. */
      subject: `[unacceptable.dev] confession from ${who}`,
      text,
      html,
    });
  } catch (err) {
    result = { ok: false, via: "threw", detail: err?.name || "error" };
  }

  if (!result.ok) {
    /* Length and transport only. The confession text itself is NEVER logged —
       Workers logs are not the owner's inbox and this content is personal. */
    console.error(
      `confess: email failed via ${result.via} (${result.detail}); ` +
      `confession was ${confession.length} chars`,
    );
    return json({ error: VOICE.upstream }, 502);
  }

  console.log(`confess: filed via ${result.via}, ${confession.length} chars`);
  return json({ ok: true }, 200);
}

/* Anything that isn't POST. */
export async function onRequest() {
  return json({ error: VOICE.method }, 405);
}
