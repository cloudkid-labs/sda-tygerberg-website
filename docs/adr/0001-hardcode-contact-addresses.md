# ADR-0001 — Contact addresses are hardcoded in `wrangler.jsonc`

- **Status:** Accepted, **temporary — intended to be reverted**
- **Date:** 2026-08-01
- **Affects:** `wrangler.jsonc`, `src/worker/contactEmail.ts`, [C-31](../../CONCERNS.md)

## Context

`/api/contact` delivers each submission by email through the Cloudflare
`send_email` binding. Three addresses configure it:

| Var | Role |
|---|---|
| `CONTACT_EMAIL_TO` | Where enquiries land |
| `CONTACT_EMAIL_FROM` | The sending alias |
| `CONTACT_EMAIL_BCC` | Optional archive copy |

They shipped as **Worker secrets**, on the reasoning recorded in C-31: this
repository is public, and a delivery address committed to it is an address that
gets scraped and spammed. That reasoning has not changed.

It has a cost, though. Secrets live only in the Cloudflare dashboard, so they
are invisible to the repository, absent from local development, not restored by
a redeploy, and easy to lose. Setting three of them is a manual step standing
between a working build and a working contact form, and until it is done the
form tells visitors it is not live.

## Decision

Move all three into the `vars` block of `wrangler.jsonc`, committed to a public
repository.

Two facts make the exposure narrower than C-31's general rule assumes:

- They are **role addresses on the operator's own domain** (`cloudkid.link`) —
  not personal addresses, not church-member data, and therefore not POPIA
  personal information. The cost of publishing them is spam to three mailboxes
  the operator controls.
- `CONTACT_EMAIL_FROM` is in the header of every message the system sends, so it
  was never meaningfully private.

Publishing them also **unlocks a real security improvement**. C-31 noted that
`allowed_destination_addresses` would be strictly better but was unavailable,
because the fence must name the address in committed config. With the addresses
public, the binding is now fenced to exactly those three, so a bug in
`contactEmail.ts` cannot mail an arbitrary recipient — it fails instead.

## Consequences

**Gained**

- Deploys are self-contained. A fresh clone plus `wrangler deploy` gives a
  working contact form with no dashboard step.
- Configuration is reviewable in a PR rather than invisible in a dashboard.
- The `send_email` binding is fenced by destination and sender.
- Local development needs no `.dev.vars` for the email path.

**Given up**

- The three addresses are public and will attract spam. Cloudflare's inbound
  filtering is the mitigation, and the addresses are disposable.
- Rotating an address is now a commit and a deploy, not a dashboard edit.
- The fence duplicates the addresses within `wrangler.jsonc`. Change one list
  and not the other and Cloudflare rejects the send. Both carry a comment.

**Unchanged**

- No code change. `contactEmail.ts` reads `env.CONTACT_EMAIL_*` identically
  whether the value arrives as a var or a secret.
- The webhook fallback, the `via` field, and every validation path.

## Revisiting

Revert this when any of these becomes true:

1. **`CONTACT_EMAIL_TO` becomes an address the church owns** rather than an
   operator alias — a real church inbox is closer to personal information and
   should not be published.
2. **The spam becomes a nuisance** on any of the three.
3. **The repository becomes private**, which removes the reason for the ADR but
   also the reason to hardcode.

The reversal is small and needs no code change:

```sh
# for each of the three
npx wrangler secret put CONTACT_EMAIL_TO
```

then delete that line from the `vars` block in `wrangler.jsonc`. Decide what to
do with the `send_email` fence at the same time: keeping it means the address
stays published in `allowed_destination_addresses`, which defeats the point, so
a genuine revert drops the fence too and accepts an unrestricted binding — the
trade C-31 originally made.

Do not leave a var and a secret of the same name in place at once. Which wins is
a Cloudflare implementation detail this project should not depend on; remove the
var.

## Amendment (2026-09-08)

Revisit trigger 1 has fired: `CONTACT_EMAIL_TO` is now an address the church
owns — the role address `welkom@sdatygerberg.co.za`, used for both delivery and
the From header. The trigger was considered and the decision stands. The
repository is private, `welkom@` is a role address rather than a personal
inbox, and the From header is public in every email the system sends
regardless; publishing it in a private repo adds no exposure. The
`send_email` fence stays — it still bounds what a Worker bug could mail.

## Amendment (2026-09-22)

The addresses have moved again and the decision still stands, with one caveat
worth recording rather than rediscovering:

| Var | Now |
|---|---|
| `CONTACT_EMAIL_TO` | `sdatygerbergklerk@gmail.com` — the church's own mailbox, not an operator alias |
| `CONTACT_EMAIL_FROM` | `welkom@sdatygerberg.co.za` |
| `CONTACT_EMAIL_BCC` | `archive@sdatygerberg.co.za` |

Revisit trigger 1 is now genuinely live: `CONTACT_EMAIL_TO` is a church inbox, and
a Gmail address in committed config is the most scrape-prone value in this repo.
It is tolerated only because the repository is **private**. If it is ever made
public, these move to Worker secrets before that happens — not after — and the
fence comes down with them, per the reversal above.

## Amendment (2026-10-03)

The personal monitoring copy `rainiersvn1@gmail.com` has been removed from
`CONTACT_EMAIL_BCC`. Exactly one church-controlled archive address remains:
`archive@sdatygerberg.co.za`, whose literal routing rule hands the message to the
`cloudkid-link-r2-explorer` Worker and into the `email-notifications` R2 bucket.
The reason is POPIA retention: a private inbox outside the responsible party's
control, with no documented retention rule, is not a lawful place to keep
personal data. The remaining obligation is a dashboard R2 lifecycle rule on
`email-notifications`; until that exists, the archive accumulates personal data
with no expiry.

## Amendment (2026-10-04)

Retention is configured: the R2 lifecycle rule on `email-notifications` expires
the archive after 7 years (set 2026-10-04 via `wrangler r2 bucket lifecycle`;
SETUP-INSTRUCTIONS §3.6).
