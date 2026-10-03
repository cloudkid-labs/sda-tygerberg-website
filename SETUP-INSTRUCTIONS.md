# Setup Instructions

Everything needed to take this repository from nothing to a working
deployment: GitHub, Cloudflare, Google Cloud, and the contact webhook.

This is the *initial setup* guide. Day-to-day facts about how the site works
(the LIVE badge's quota window, the contact form's `outcome` codes, the
branch strategy) live in [`README.md`](./README.md) — this document tells you
which buttons to press, once.

**Nothing in here contains a real secret value.** Every key, token and ID is
written as a placeholder. Fill them in directly in the GitHub and Cloudflare
dashboards; never commit them to the repository.

---

## 0. What you need before you start

| Thing | Why | Notes |
|---|---|---|
| **GitHub account** with admin on the repo | Pages, Actions secrets, branch rules | Admin is required — Settings pages are hidden otherwise |
| **Cloudflare account** | Hosts the Worker and the live site | Free plan is enough |
| **Two domains in that Cloudflare account** | Production and the devtest preview | `sdatygerberg.co.za` (production) and `cloudkid.link` (serving the `tygerberg-sda.cloudkid.link` devtest preview) |
| **Google account** | YouTube Data API key for the LIVE badge | Optional — everything else works without it |
| **Somewhere to receive form submissions** | The contact form's destination | A church inbox verified in Cloudflare, or any JSON webhook |
| **Node 24 LTS + git** | Local development only | Version is pinned in `.nvmrc` |

The site degrades honestly when a piece is missing: no YouTube key means the
LIVE badge simply never appears, and no contact destination means the request
forms say so instead of silently dropping people's messages. You can set this
up in stages.

---

## 1. Local development

```sh
nvm use            # picks up Node 24 from .nvmrc
npm install
npm run dev        # http://localhost:4321
```

`npm run dev` runs Astro alone, so the `/api/*` routes don't exist and any
call to them 404s. That's harmless — the LIVE badge stays hidden and the
contact form reports a network error.

To run the site the way production actually serves it (static assets **plus**
the Worker), use Wrangler:

```sh
npm run worker:dev     # builds, then wrangler dev on http://localhost:8787
```

For local secrets, copy the example file — `.dev.vars` is gitignored, so it
never leaves your machine:

```sh
cp .dev.vars.example .dev.vars
```

```ini
# .dev.vars
YOUTUBE_API_KEY="<your-key>"
YOUTUBE_CHANNEL_ID="UCtZlioPBBORWMMMSJ9BE1Wg"
CONTACT_EMAIL_TO="kerk@example.org"
CONTACT_EMAIL_FROM="webwerf@example.org"
CONTACT_WEBHOOK_URL="https://<your-webhook>"
```

Three local-testing tips:

- Widening `LIVE_CHECK_CRON` to `* * * * *` in `.dev.vars` saves waiting
  until Saturday morning to see the LIVE badge work.
- The email channel needs no Cloudflare account locally. `wrangler dev`
  simulates the binding: the two addresses above can be anything, and the
  message is printed and written to `.wrangler/tmp/email/` rather than sent.
- To test the webhook fallback, leave the two `CONTACT_EMAIL_*` lines out —
  email is preferred whenever it is configured — and point
  `CONTACT_WEBHOOK_URL` at any local server that returns `200`.

---

## 2. GitHub setup

### 2.1 Branches

Two long-lived branches, and the workflows key off them:

| Branch | Role | Deploys to |
|---|---|---|
| `dev` | Integration. Feature PRs target this. | Cloudflare devtest Worker (`tygerberg-sda.cloudkid.link`) |
| `main` | Production. Only moves via a reviewed `dev` → `main` promotion PR. | Cloudflare (the live site, `sdatygerberg.co.za`) |

Create them if they don't exist, and set **`dev` as the repository's default
branch** (Settings → General → Default branch) so new PRs target it
automatically.

Promotions merge as **merge commits**, never squashes, and the version bump
happens on `dev` — see [RELEASE.md](./RELEASE.md). Squashing a promotion is what
makes the two branches drift apart.

### 2.2 Add the Actions secrets

Settings → **Secrets and variables → Actions** → *New repository secret*.
Both workflows — devtest and production — use the same two:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The API token from step 3.2 — must reach **both** the `sdatygerberg.co.za` and `cloudkid.link` zones |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID from step 3.1 |

> These are **build-time** credentials for deploying. They are *not* how the
> Worker gets its own secrets — see step 4, and the warning there.

### 2.3 Branch protection (recommended)

Settings → **Rules → Rulesets** (or Branches → Protection rules) on `main`:

- Require a pull request before merging
- Require the *Deploy production (Cloudflare)* check where you want it
- Disallow force pushes

The point is that production only ever moves through a reviewed promotion PR,
which is the whole reason `main` is separate from `dev`.

### 2.4 The two workflows

Both live in `.github/workflows/` and read the Node version from `.nvmrc`, so
bumping that file is enough to move CI to a newer Node LTS.

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy-devtest-cloudflare.yml` | push to `dev`, or manual | The devtest preview: a second Worker (`tygerberg-sda-website-devtest`, via `env.devtest`) on `tygerberg-sda.cloudkid.link`. A faithful mirror — static assets + Worker + `/api/*` — but `noindex` and with no email/consent bindings. |
| `deploy-production-cloudflare.yml` | push to `main`, or manual | The real site on `sdatygerberg.co.za`: static assets + Worker + `/api/*`. |

Both also expose **`workflow_dispatch`**, so you can re-run either from the
Actions tab without pushing a new commit — useful for redeploying after
changing a Worker secret, and for previewing a feature branch on devtest
without merging it. Keep that trigger in place.

---

## 3. Cloudflare setup

### 3.1 Find your account ID

Cloudflare dashboard → **Workers & Pages**. The account ID is in the right-hand
sidebar (and in the URL: `dash.cloudflare.com/<account-id>/...`). Copy it into
the `CLOUDFLARE_ACCOUNT_ID` GitHub secret from step 2.2.

### 3.2 Create the API token

**My Profile → API Tokens → Create Token.**

The **"Edit Cloudflare Workers"** template gets most of the way there, but
check the R2 row below is in what it generates before you save — the template
has not always included it, and a token without it deploys everything up to the
consent bucket and then fails (see the troubleshooting table).

The full set:

| Scope | Permission |
|---|---|
| Account → Workers Scripts | **Edit** |
| Account → Workers R2 Storage | **Edit** (for the consent bucket — §3.6) |
| Account → Account Settings | **Read** |
| Zone → Workers Routes | **Edit** (for the custom domain) |
| Zone → DNS | **Edit** (so `wrangler deploy` can attach the domain) |

`User → User Details` and `User → Memberships` at **Read** are optional. They
only affect what `wrangler whoami` can print about you; nothing deploys or
fails on them.

Scope it to the one account and the one zone rather than "all accounts". Leave
**Client IP Address Filtering** empty — GitHub-hosted runners get dynamic
egress IPs, so a filter here breaks the deploy with the same opaque `10000`
that a missing permission gives you.

Your own account role is not the token's role. A Super Administrator can hold a
token that can do exactly one thing; the token carries only what is listed
above.

Copy the token **immediately** — Cloudflare shows it exactly once — into the
`CLOUDFLARE_API_TOKEN` GitHub secret.

### 3.3 The Worker itself

You do **not** create the Worker by hand. `wrangler deploy` creates it on the
first run from `wrangler.jsonc`, which already pins:

- **name** — `tygerberg-sda-website`
- **main** — `src/worker/index.ts`
- **assets** — the Astro build in `./dist`, bound as `ASSETS`
- **vars** — `LIVE_CHECK_CRON`, `LIVE_CHECK_TZ` (non-secret, safe in git)
- **routes** — `sdatygerberg.co.za` as a `custom_domain` (production, top-level);
  `tygerberg-sda.cloudkid.link` as a `custom_domain` under `env.devtest`

Because both zones already live in the same Cloudflare account, each route is
provisioned and attached automatically on its deploy — there's no separate DNS
record to add. To use a different domain, change the `routes` entry, make sure
that zone is in the same account, and redeploy.

**www → apex.** The apex `sdatygerberg.co.za` is canonical. `www` is not a
Worker route — `run_worker_first` is path-scoped, so a whole-host redirect
cannot live in the Worker. Add a **Redirect Rule** instead (Cloudflare
dashboard → the `sdatygerberg.co.za` zone → Rules → Redirect Rules): when
hostname equals `www.sdatygerberg.co.za`, a 301 to
`https://sdatygerberg.co.za${http.request.uri.path}`. A proxied `www` DNS
record must exist for the rule to have something to match.

**Image Resizing.** Production headshots are served through
`/cdn-cgi/image/*`, which requires **Image Resizing (Transform via URL)**
enabled on the `sdatygerberg.co.za` zone. Without it those requests 404 and the
cards fall back to the pre-resized copies. The `cloudkid.link` zone already has
it, so devtest needs nothing.

**Cutover order (one-time, only when moving the hostname between Workers).**
`tygerberg-sda.cloudkid.link` starts out attached to the **production** Worker.
Deploying production to the apex does **not** release it — `wrangler` adds the
custom domains in the config but never detaches one you removed. So the handoff
is manual and ordered:

1. Deploy **production** first (promote `dev` → `main`). It attaches
   `sdatygerberg.co.za`; the apex is now live. `tygerberg-sda.cloudkid.link` is
   still attached to the production Worker at this point.
2. In the dashboard, **detach** `tygerberg-sda.cloudkid.link` from the
   `tygerberg-sda-website` Worker (Worker → Settings → Domains & Routes → remove).
3. Re-run the **devtest** deploy (Actions → *Deploy devtest (Cloudflare)* →
   Run workflow). It can now attach the freed hostname to
   `tygerberg-sda-website-devtest`.

Until step 2, the devtest deploy fails with "custom domain already assigned to
another Worker" — expected, not a build error.

### 3.4 First deploy

Easiest path is to merge to `main` and let the workflow run. To deploy from
your machine instead:

```sh
npx wrangler login
npm run deploy        # astro build && wrangler deploy
```

### 3.5 Bot protection for `/api/contact`

> **This is not optional.** The contact form has no spam filtering of its own —
> it was deliberately left to Cloudflare's edge. Until the two settings below
> are on, `/api/contact` is an open endpoint that delivers to the church on
> every valid POST — which, once §6 is done, means straight into their inbox.

Both settings only apply to traffic through a **custom domain on your zone**.
A `*.workers.dev` URL does not get zone-level bot protection, so the Worker
must be on the church's own domain (§3.3) for any of this to take effect.

**Bot Fight Mode** — Dashboard → your domain → **Security → Bots** → turn on
*Bot Fight Mode*. Free on all plans. It challenges traffic that Cloudflare's
heuristics score as automated, which handles the commodity form-spam bots.

Be aware of what it does *not* do: it won't stop a low-volume scripted POST
from a residential IP, and it isn't a rate limit. Add one:

**Rate limiting rule** — Dashboard → your domain → **Security → WAF → Rate
limiting rules** → *Create rule*:

| Field | Value |
|---|---|
| Rule name | `contact-form-limit` |
| If incoming requests match | `URI Path` `equals` `/api/contact` |
| Also match | `Request Method` `equals` `POST` |
| Rate | `5` requests per `1 minute` per `IP` |
| Action | `Block` (or `Managed Challenge`) |
| Duration | `1 minute` |

Five a minute is far above what a person filling in a form needs and far
below what makes a flood worth attempting. One free rate-limiting rule is
included on the free plan, which is exactly enough for this.

If spam still gets through, the next step up is **Turnstile** (Cloudflare's
CAPTCHA alternative, free) — but that one needs code: a widget in
`RequestForm.tsx` and a `siteverify` call in `handleContact` before the
forward. Not wired up, since the two settings above should be sufficient.

Check it's working:

```sh
# Should start returning 429/403 well before the tenth request.
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://<your-domain>/api/contact \
    -H 'Content-Type: application/json' -d '{}'
done; echo
```

### 3.6 Consent records — retention rule **(do this, it is not optional)**

`/api/contact` writes one JSON consent record per submission to the
`consent-cloudkid-link` R2 bucket. The binding is in `wrangler.jsonc` and needs
no dashboard step — **the retention rule does**, because R2 lifecycle rules
cannot be expressed in Wrangler config.

Personal data kept forever is a POPIA problem. Until a rule exists, these
records accumulate with no expiry.

1. Cloudflare dashboard → **R2** → `consent-cloudkid-link` → **Settings**
2. **Object lifecycle rules** → *Add rule*
3. Scope it to the prefix `20` (every key starts `YYYY/MM/DD/`, so this covers
   all records and nothing else)
4. **Delete objects after N days** — pick the period with the church. Consent
   needs to outlive the relationship it authorises, so this is a governance
   decision, not a technical one. If nobody has an opinion, **7 years** matches
   ordinary South African record-keeping practice and is the safe default.

The same lifecycle rule is needed on the `email-notifications` bucket, because
it holds the contact-form archive copy written by the `archive@` literal rule
(and the inbound-mail archive from §6.6). That archive contains the full
message body, so it is personal data at rest and needs its own expiry. Use the
same governance process: pick the period with the church, and if nobody has an
opinion, **7 years** is the safe default.

This binding is why **Workers R2 Storage: Edit** is in the §3.2 table. Without
it the deploy uploads the script and the assets, then dies on the bucket with
`Authentication error [code: 10000]` — everything looks fine until the very
last step.

To read the records back:

```bash
npx wrangler r2 object get consent-cloudkid-link/2026/08/09/<key>.json
```

Each object also carries `topic`, `submittedAt` and `consentVersion` as custom
metadata, so a listing answers most audit questions without downloading bodies.

---

## 4. Worker secrets

> **These must be Worker secrets, not GitHub Actions secrets.** Actions
> secrets exist only at build time and would never reach the running Worker.
> Worse, exposing an API key to the client build would publish it to anyone
> who views source.

Set them in the Cloudflare dashboard — **Workers & Pages →
`tygerberg-sda-website` → Settings → Variables and Secrets** — or from the CLI:

```sh
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put YOUTUBE_CHANNEL_ID
npx wrangler secret put CONTACT_WEBHOOK_URL
```

| Secret | Required for | Value |
|---|---|---|
| `YOUTUBE_API_KEY` | LIVE badge | A Google Cloud API key with YouTube Data API v3 enabled (step 5) |
| `YOUTUBE_CHANNEL_ID` | LIVE badge | `UCtZlioPBBORWMMMSJ9BE1Wg` |
| `CONTACT_WEBHOOK_URL` | Contact form (fallback only) | Where submissions go if email fails (step 6.4) |

The contact form's **email** addresses are not secrets — they are committed in
`wrangler.jsonc` and arrive with the deploy. That is a temporary decision; see
[ADR-0001](./docs/adr/0001-hardcode-contact-addresses.md) and step 6.3.

The form needs **either** the email addresses **or** the webhook — not both.
Neither means it reports `not-configured`.

Secrets take effect on the next deploy. After changing one, re-run the
production workflow from the Actions tab (`workflow_dispatch`) or run
`npm run deploy`.

**If a key is ever exposed** — pasted into a chat, committed, screenshotted —
treat it as burned: delete it in Google Cloud, create a fresh one, and
`wrangler secret put` the new value. Rotating is a two-minute job; a leaked
key on someone else's quota is not.

---

## 5. Google Cloud (YouTube API key)

Only needed for the LIVE badge. Skip it and the badge simply never shows —
the video embed on the homepage works without any key, because it always
embeds the channel's auto-generated uploads playlist.

1. [Google Cloud Console](https://console.cloud.google.com/) → create a
   project (e.g. *Tygerberg SDA Website*).
2. **APIs & Services → Library** → find **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials** → *Create credentials* → **API key**.
4. **Restrict the key** (do not skip this):
   - *API restrictions* → **Restrict key** → YouTube Data API v3 only.
   - *Application restrictions* → **None**. The key is used from the Worker,
     server-side; an HTTP-referrer restriction would block it, since there's
     no browser referrer on a Worker's outbound request.
5. Put the key in the `YOUTUBE_API_KEY` Worker secret (step 4).

**Watch the quota.** `search.list` costs 100 units against a 10,000/day
default. One upstream answer is shared across a Cloudflare colo for 60 seconds
(`src/worker/liveStatusCache.ts`, CONCERNS.md C-16), so cost scales with *time
inside the window*, not with concurrent viewers: roughly 60 calls an hour per
colo that has anyone watching, whatever the audience. Sizing the key's quota
off viewer numbers will overshoot by a wide margin.

The Saturday-morning window in `wrangler.jsonc` is what bounds it — outside the
window no call is made at all. See the README's LIVE badge section before
widening it.

---

## 6. Where contact submissions go

`/connect` and `/bible-studies` post to `/api/contact`, which delivers each
validated submission down **one** of two channels:

1. **Email** (preferred) — Cloudflare Email Sending, straight to the church
   inbox. No third-party account, no automation service.
2. **A webhook** (fallback) — used only when email is unconfigured or fails.

Set up whichever suits you. Email is fewer moving parts and is what the rest of
this section covers; the webhook is §6.4.

### 6.1 Verify the destination address

The free path sends only to a **verified destination address** on your
Cloudflare account. Sends to those cost nothing on any plan and do not consume
the sending quota.

1. Cloudflare dashboard → your domain → **Email** → **Email Routing**.
2. **Destination addresses** → *Add address* → the church's shared inbox.
3. Cloudflare emails that address a confirmation link. **Click it** — an
   unverified address is rejected at send time.

Use a shared church inbox, not an individual's personal address. Whoever
receives these is handling personal information under POPIA.

### 6.2 Onboard the sending domain — **must be done for `sdatygerberg.co.za`**

The From address must sit on a domain Cloudflare is authorised to send for, and
the domain must use Cloudflare DNS. `sdatygerberg.co.za` is **not** onboarded
yet — nothing is pre-satisfied on the church zone.

1. Dashboard → **Email** → **Email Sending** → add `sdatygerberg.co.za`.
2. Cloudflare adds the DNS records itself — SPF, DKIM, DMARC, and MX records on
   a `cf-bounce` subdomain. Propagation is usually 5–15 minutes.
3. Wait for the domain to show as verified before testing.

Until this is done, `welkom@sdatygerberg.co.za` is not a valid sender and the
email channel fails. Confirm onboarding at any time — all four must answer:

```sh
dig +short MX  cf-bounce.sdatygerberg.co.za           # bounce routing
dig +short TXT cf-bounce.sdatygerberg.co.za           # sending SPF
dig +short TXT cf-bounce._domainkey.sdatygerberg.co.za # sending DKIM
dig +short TXT _dmarc.sdatygerberg.co.za              # DMARC
```

Email Sending and Email Routing use **separate** records and separate DKIM
selectors (`cf-bounce._domainkey` vs `cf2024-1._domainkey`). A domain that
routes mail is not thereby allowed to send it, so do not read the apex MX
records as evidence for this step.

### 6.3 Set the two secrets

**There is nothing to set.** The two addresses are committed in
`wrangler.jsonc`, so a deploy carries them:

```jsonc
"CONTACT_EMAIL_TO":   "welkom@sdatygerberg.co.za",
"CONTACT_EMAIL_FROM": "welkom@sdatygerberg.co.za"
```

**`TO` has to be an address a person reads.** `welkom@` must be wired to an
inbox — as an Email Routing custom address on `sdatygerberg.co.za` forwarding
onward, or however the church resolves it — so the enquiry goes somewhere.

This is a deliberate, temporary reversal of the "delivery addresses are secrets"
rule — read [ADR-0001](./docs/adr/0001-hardcode-contact-addresses.md) before
changing it. The `send_email` binding is declared there too, fenced to exactly
these addresses.

To use different addresses, edit **three** places in `wrangler.jsonc` — the
`vars` block and the binding's `allowed_destination_addresses` /
`allowed_sender_addresses` — then redeploy. Out of step, Cloudflare rejects the
send.

What is left is **both §6.1 and §6.2**: `welkom@` is an Email Routing *custom
address* on `sdatygerberg.co.za` — a routing-rule pattern — and a working
routing rule is not the same permission as being a verified **destination
address**. Add it under **Destination Addresses** and click its confirmation
link. The sending domain must be onboarded too (§6.2); nothing on
`sdatygerberg.co.za` is pre-satisfied.

That applies on the Workers **Free** plan. On **Workers Paid**, Email Sending
may address any recipient and §6.1 stops mattering. Check the plan before
spending time on it — it decides whether there is anything to do here.

> `CONTACT_EMAIL_BCC` archives one church-controlled copy to
> `archive@sdatygerberg.co.za`. For it to work: (a) `archive@` must be a verified
> destination address under Email Routing, (b) the literal routing rule for
> `archive@` must hand the message to the `cloudkid-link-r2-explorer` Worker, and
> (c) the `email-notifications` R2 bucket must have a lifecycle rule so the
> archive does not keep personal data forever (§3.6). `contactEmail.ts` still
> honours a BCC set as a Worker secret, but re-add the address to
> `allowed_destination_addresses` at the same time. Put one real submission
> through the form and confirm the response says `"via":"email"` before
> considering this done.

A submission arrives as plain text, subject `Webwerf — Verbind: <name>` (or
`Bybelstudie`), with **Reply-To set to the visitor's address** when they gave
one, so replying from the inbox reaches them directly.

### 6.4 The webhook fallback

Any endpoint that accepts a JSON `POST` works, which keeps the church off any
single vendor. Common choices: a **Zapier** catch hook, a **Make** custom
webhook, a **Google Apps Script** web app, or a self-hosted **n8n** webhook.

This runs only when the email channel is unconfigured or fails, so setting it
alongside email gives you a spare rather than a duplicate.

The payload delivered to your webhook looks like this:

```json
{
  "topic": "bible-study",
  "name": "Jan Bybel",
  "email": "jan@example.co.za",
  "phone": "021 555 0100",
  "message": "Ek wil graag ’n studie aanvra.",
  "submittedAt": "2026-07-27T18:30:42.804Z",
  "consent": true,
  "source": "tygerberg-sda-website"
}
```

- `topic` is either `connect` (general enquiry, from `/connect`) or
  `bible-study` (from `/bible-studies`) — use it to route to the right person.
- Exactly one of `email` / `phone` is guaranteed non-empty; the other may be
  an empty string. The form asks for the minimum needed to reply.
- `consent` and `submittedAt` are recorded because POPIA consent has to be
  demonstrable after the fact, and your inbox is the only place the
  submission survives. **Keep them.**

Whoever receives these is handling personal information: route them to a
shared church inbox rather than an individual's personal address, and delete
them once the request is dealt with.

Until **either** channel is configured, the endpoint answers `not-configured`
and the form tells visitors it isn't live yet rather than pretending a message
was sent. The response's `via` field names the channel that carried a delivery,
which is the quickest way to confirm which one is actually doing the work.

### 6.5 Trying it locally

`npm run worker:dev` simulates the `send_email` binding instead of sending: it
prints From/To/Subject to the terminal and writes the body to
`.wrangler/tmp/email/`. Put any values in `.dev.vars` — no Cloudflare account,
no verified address, nothing leaves the machine — and you can read exactly what
the church would receive.

### 6.6 Inbound mail for the whole domain

§6.1–6.5 cover *outbound* mail. The other direction is one Worker with two
forwards: the `sdatygerberg.co.za` zone's **catch-all** routes every address —
`welkom@`, `tesourier@`, anything — to the production Worker, whose `email()`
handler (`src/worker/inboundEmail.ts`) makes two copies.

1. **The church inbox** — `MAIL_FORWARD_TO`. The delivery: if it fails, the
   message is *rejected*, so the sender gets a bounce.
2. **The archive** — `MAIL_ARCHIVE_TO`, a local address that a **literal
   routing rule** fires at the `cloudkid-link-r2-explorer` Worker. That Worker
   files mail in R2 and does nothing else,
   which is what keeps a second pass through Email Routing from being a loop.
   A failure here is logged, not fatal — the church copy has already gone.

Both addresses are vars in `wrangler.jsonc` (a deploy carries them) and both
must be **verified destination addresses** on the account, or `forward()`
throws. Wiring it up from scratch:

1. Verify both addresses — §6.1's flow.
2. Add the literal rule: `archive@` → *Send to a Worker* →
   `cloudkid-link-r2-explorer`.
3. Point the catch-all at the Worker: *Send to a Worker* →
   `tygerberg-sda-website`.
4. Deploy. No secrets, no dashboard vars.

Out of step, two things show up — both only in
`wrangler tail tygerberg-sda-website`, which is this path's entire diagnostic
surface (the same lesson as C-64): `inbound mail: forward to <address> failed:
<reason>` for a lost verification or a missing archive rule, and a bounced
message at the sender when the church copy itself failed. If the archive rule
is deleted, mail to `archive@` falls to the catch-all and reaches the handler
again — the guard in `inboundEmail.ts` refuses to re-post it to itself, so that
failure is logged rather than looping.

Devtest never receives mail: nothing routes to it, and it carries no `MAIL_*`
vars, so an unconfigured handler refuses rather than guessing a destination.

---

## 7. Verifying the setup

After the first production deploy:

```sh
# Worker is serving and the LIVE-badge window resolves
curl https://sdatygerberg.co.za/api/live-status

# Contact route rejects a submission with no consent (should be 400)
curl -i -X POST https://sdatygerberg.co.za/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"topic":"connect","name":"Test","email":"test@example.com"}'
```

A green setup looks like:

- [ ] `https://sdatygerberg.co.za` loads the homepage
- [ ] `https://www.sdatygerberg.co.za` 301-redirects to the apex
- [ ] `/api/live-status` returns JSON with a `source` field — `outside-window`
      on most days is correct, not an error
- [ ] `/connect` and `/bible-studies` load and show the form
- [ ] Submitting a real request lands in the church inbox
- [ ] That submission's response says `"via":"email"` — if it says
      `"via":"webhook"`, the email channel is not configured and the fallback
      carried it; if it says `not-configured`, neither is set (step 6)
- [ ] `https://tygerberg-sda.cloudkid.link` (devtest) loads and `/api/*`
      answers, with the contact form reporting `not-configured` on submit
      (expected — devtest carries no email binding)

Send one real submission through the form rather than by `curl`. It is the only
check that proves the whole chain — validation, delivery, and a human actually
receiving it — and `via` tells you which channel did the work.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Devtest deploy fails: custom domain already assigned to another Worker | `tygerberg-sda.cloudkid.link` is still attached to the production Worker | Detach it from `tygerberg-sda-website` (§3.3 cutover), then re-run the devtest deploy — `wrangler` never auto-detaches a removed custom domain |
| Production deploy fails with a 10000/authentication error on `/r2/buckets/...` | Token is missing **Workers R2 Storage: Edit** | Add that one row to the existing token — §3.2. No need to reissue it or touch the GitHub secret |
| Production deploy fails with a 10000/authentication error anywhere else | Token lacks scope, wrong account ID, or an IP filter is set on the token | Check the §3.2 table, then recreate the token if it still fails |
| `/api/*` 404s in production | Worker didn't deploy, or the route isn't attached | Check the Actions run, then the Worker's Triggers tab |
| LIVE badge never shows | Missing/invalid key, or outside the window | `curl /api/live-status` and read `source` |
| `/api/live-status` says `not-configured` | Secrets missing on the Worker | Step 4 — and check they weren't added as Actions secrets by mistake |
| `/api/live-status` says `invalid-schedule` | Malformed cron or unknown timezone in `wrangler.jsonc` | Fails closed and spends no quota; fix the expression and redeploy |
| Contact form says it isn't live yet | Neither delivery channel is configured | Step 6 — the two `CONTACT_EMAIL_*` secrets *or* `CONTACT_WEBHOOK_URL` — then redeploy |
| Contact form reports a send failure | Every configured channel failed | Worker logs name the cause; see the two rows below |
| Log shows `E_SENDER_NOT_VERIFIED` | `CONTACT_EMAIL_FROM` is on a domain not onboarded to Email Sending | Step 6.2, and check the domain shows as verified |
| Email silently never arrives, `via` says `webhook` | `CONTACT_EMAIL_TO` isn't a *verified* destination address | Step 6.1 — click the confirmation link Cloudflare emailed |
| Webhook fallback times out | Endpoint slow or returning non-2xx | Check the webhook; the Worker waits 10s |
| A secret change had no effect | Secrets apply at deploy time | Re-run the production workflow, or `npm run deploy` |
