# Tygerberg SDA Church Website

Bilingual (Afrikaans/English) site for Tygerberg Seventh-day Adventist Church
(Boston, Bellville, Cape Town). Astro static output + React islands, served by a
Cloudflare Worker at `sdatygerberg.co.za`.

- **How to run, deploy and maintain it** — this file.
- **Why the code is shaped the way it is, and what breaks if you change it
  back** — [`CONCERNS.md`](./CONCERNS.md). Code carries `C-NN` references into it.
- **First-time setup from scratch** — [`SETUP-INSTRUCTIONS.md`](./SETUP-INSTRUCTIONS.md).

Astro (static) · React islands · Tailwind v4 (tokens in `src/styles/global.css`)
· TypeScript · Cloudflare Workers via Wrangler · Node 24 LTS (`.nvmrc`).

## Commands

```sh
nvm use && npm install

npm run dev          # Astro dev server, http://localhost:4321
npm run build        # static build into dist/
npm run worker:dev   # build, then wrangler dev — Worker + /api/* locally
npm run deploy       # build, then wrangler deploy
npx tsc --noEmit     # typecheck
```

`/api/*` exists only under `worker:dev` or a real deploy. For the LIVE badge
locally, copy `.dev.vars.example` to `.dev.vars` (gitignored), add a YouTube key,
and widen `LIVE_CHECK_CRON` to `* * * * *` so you needn't wait for Saturday.

The contact form's email channel needs no Cloudflare account locally: `wrangler
dev` simulates the `send_email` binding, printing From/To/Subject and writing the
body to `.wrangler/tmp/email/` instead of sending. Put any two addresses in
`.dev.vars` and you can read what the church would receive.

## Configuration

**Worker secrets** — dashboard → Workers & Pages → `tygerberg-sda-website` →
Settings → Variables and Secrets, or `wrangler secret put`. Must be Worker
secrets, not Actions or build-time variables ([C-18](./CONCERNS.md#c-18--the-api-key-must-be-a-worker-secret-never-a-build-time-variable)):

| Secret | Purpose | Unset behaviour |
|---|---|---|
| `YOUTUBE_API_KEY` | Google Cloud key, YouTube Data API v3 enabled | LIVE badge stays hidden |
| `YOUTUBE_CHANNEL_ID` | `UCtZlioPBBORWMMMSJ9BE1Wg` | as above |
| `CONTACT_WEBHOOK_URL` | Fallback channel; any JSON POST endpoint | webhook channel skipped |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret for `/api/contact` — set with `wrangler secret put`, never a dashboard Secrets Store binding, which the next deploy prunes ([C-21](./CONCERNS.md#c-21--abuse-protection-is-cloudflares-and-it-is-off-by-default)) | human check skipped ([C-21](./CONCERNS.md#c-21--abuse-protection-is-cloudflares-and-it-is-off-by-default)) |

The contact **email** address is not a secret — it is a committed var, a
temporary decision recorded in
[ADR-0001](./docs/adr/0001-hardcode-contact-addresses.md). See the vars table
below.

The two YouTube values may be stored as repo secrets instead — the production
workflow uploads them — but remove one from repo settings without removing it
from the workflow and an empty value gets uploaded.

The three contact values are deliberately **not** on that bridge. It passes
secrets by name, so listing an optional one there overwrites a working
dashboard value with an empty string the moment the repo secret is absent. Set
them in the dashboard, or with `wrangler secret put`.

**Worker vars** — `wrangler.jsonc`, edit and redeploy, no code change:

| Var | Default | Meaning |
|---|---|---|
| `LIVE_CHECK_CRON` | `* 9-12 * * 6` | When the LIVE badge may spend quota, read as a *window*. Saturdays 09:00–12:59, covering the 09:00–12:30 stream. **Keep the minute field `*`** ([C-14](./CONCERNS.md#c-14--live_check_cron-is-a-window-not-a-schedule)). |
| `LIVE_CHECK_TZ` | `Africa/Johannesburg` | Timezone the window is evaluated in |
| `CONTACT_EMAIL_TO` | `sdatygerbergklerk@gmail.com` | Where `/api/contact` emails — the church's real mailbox. Must be a **verified destination address** |
| `CONTACT_EMAIL_FROM` | `welkom@sdatygerberg.co.za` | From address (DKIM-aligned via cf-bounce selectors) — the church replies to the enquirer via Reply-To |
| `CONTACT_EMAIL_BCC` | `archive@sdatygerberg.co.za, rainiersvn1@gmail.com, sdatygerbergkerk@gmail.com` | Copies of every enquiry. `archive@` has a literal routing rule that hands it to `cloudkid-link-r2-explorer`, which files it in R2; the others are plain inbox copies. A comma-separated list — every address must also be in `allowed_destination_addresses` or the whole send is rejected |
| `TURNSTILE_HOSTNAMES` | `sdatygerberg.co.za` (devtest: `tygerberg-sda.cloudkid.link`) | Hostnames siteverify must echo back; tokens minted on any other domain are refused. Unset disables the hostname check |
| `MAIL_FORWARD_TO` | `sdatygerbergklerk@gmail.com` | Inbound mail: the zone's catch-all hands every address to the Worker, which forwards a copy here. Must be a verified destination address — a failure **rejects** the message so the sender learns |
| `MAIL_ARCHIVE_TO` | `archive@sdatygerberg.co.za` | The second, best-effort copy of every inbound message: a literal routing rule sends this address to `cloudkid-link-r2-explorer`, which files it in R2 |
| `MAIL_ROUTES` | `{ "tesourier@sdatygerberg.co.za": "a2msars@gmail.com" }` | Inbound exceptions to `MAIL_FORWARD_TO`, per local address. `tesourier@` is the Zapper merchant address, so payment notifications reach the treasurer. Each destination must be a verified destination address |

The BCC used to point at an unread Worker inbox, where a second recipient could
fail the whole send on the free path
([C-31](./CONCERNS.md#c-31--email-is-tried-first-and-the-webhook-is-the-fallback)).
Both addresses now point at destinations that terminate — R2 storage and a
mailbox — and `contactEmail.ts` splits the var on commas.

The `MAIL_*` vars are the **inbound** side of the same problem — one
catch-all, one Worker, two forwards. See CONCERNS.md
[C-65](./CONCERNS.md#c-65--inbound-mail-is-one-catch-all-two-forwards-and-a-stored-copy)
and SETUP-INSTRUCTIONS §6.6; the failure modes are logged to the Worker's tail
and visible nowhere else.

Changing a contact-form address means changing it in the `vars` block and in
the `send_email` binding's matching list, `allowed_destination_addresses`
(TO, BCC) or `allowed_sender_addresses` (FROM). Out of step, the
send is rejected ([C-31](./CONCERNS.md#c-31--email-is-tried-first-and-the-webhook-is-the-fallback)).

**Build-time env vars** — set by the workflows; unset means "on":

| Var | Effect when set |
|---|---|
| `ASTRO_BASE` | Serve under a subpath, e.g. `/sda-tygerberg-website/` |
| `PUBLIC_HAS_API=false` | Skip the live-status poll; contact form read-only |
| `PUBLIC_INDEXABLE=false` | Emit `noindex,nofollow`, serve `Disallow: /` robots with no sitemap, 404 the sitemap, drop `llms.txt`, omit JSON-LD, send `X-Robots-Tag: noindex` — the no-SEO preview contract ([C-23](./CONCERNS.md#c-23--the-preview-is-de-seoed-not-gated)) |
| `PUBLIC_IMAGE_CDN=false` | Serve the fallback headshots, skip the transformer probe — the escape hatch for a zone without Image Resizing; both builds leave it on |
| `PUBLIC_TURNSTILE_SITE_KEY` | Render the Turnstile widget on the form pages; the Worker verifies the token only where `TURNSTILE_SECRET_KEY` is set, otherwise the token is ignored |

Create the Turnstile widget in the Cloudflare dashboard (Turnstile) for
`sdatygerberg.co.za`: the **site key** goes to the build as
`PUBLIC_TURNSTILE_SITE_KEY` (Actions variable — it ships in the HTML), the
**secret key** to the Worker via `wrangler secret put TURNSTILE_SECRET_KEY`.
Set neither and the form submits exactly as before.

## Branch strategy and CI/CD

- **`dev`** — integration. Feature PRs target `dev`; each merge deploys the
  devtest Worker at `tygerberg-sda.cloudkid.link`.
- **`main`** — production. Moves only via a reviewed `dev` → `main` promotion PR;
  merging deploys the production Worker at `sdatygerberg.co.za`.

Promotions merge as **merge commits, never squashes** — squash rewrites `dev`'s
commits on `main` and the two drift apart for good. The merge leaves `main` one
commit ahead, so the promotion finishes by fast-forwarding `dev` onto it
(`git push origin origin/main:dev`). Both branches then sit on the same commit:
`git diff origin/dev origin/main` is empty and `git rev-list --count` is zero in
both directions ([RELEASE.md](./RELEASE.md)).

| Workflow | Target | Trigger | Build env |
|---|---|---|---|
| `deploy-devtest-cloudflare.yml` | Cloudflare Workers (`…-devtest`) | push to `dev`, manual | `PUBLIC_INDEXABLE=false` |
| `deploy-production-cloudflare.yml` | Cloudflare Workers | push to `main`, manual | — |

Both read the Node version from `.nvmrc` and use the same repo secrets —
`CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + access to both the
`sdatygerberg.co.za` and `cloudkid.link` zones) and `CLOUDFLARE_ACCOUNT_ID`.
Each environment's custom domain attaches itself on deploy via `routes` in
`wrangler.jsonc` (production top-level, devtest under `env.devtest`).

devtest is a faithful mirror now — a real Worker with `/api/*` and the security
headers — replacing the sunset GitHub Pages preview. Its only differences from
production are `noindex` and no email/consent bindings, so a preview never
emails the church ([C-61](./CONCERNS.md#c-61--production-moves-to-sdatygerbergcoza-and-devtest-becomes-a-worker)).

## Versioning and releases

`version` in `package.json` is the single source of truth, and it follows
[Semantic Versioning](https://semver.org/). A production deploy reads it and,
**if that version has no release yet**, tags the deployed commit `vX.Y.Z` and
cuts a GitHub Release with generated notes.

### What the numbers mean

Semver is defined for software with a public API. A website has one too — it is
just easy to forget what it is. Here the contract is **the Worker's HTTP routes
and the site's public URLs**, because those are the only things anything
external depends on.

| | When | Examples |
|---|---|---|
| **MAJOR** | A breaking change to `/api/*` response shape, or a public URL removed or renamed | dropping `isLive`, moving `/giving` |
| **MINOR** | New capability, page or endpoint — nothing existing breaks | adding `/api/contact`, a new section |
| **PATCH** | Content, copy, styling, fixes | roster corrections, a swipe fix |

*Adding* a field to an API response is a MINOR, not a MAJOR: a client reading
`isLive` is unaffected by `watchUrl` appearing beside it.

**On 1.x.** The move off `0.y.z` happened at `v1.1.0` and skipped `1.0.0`
entirely — there is no such tag and no such changelog entry, so the release that
was meant to be the deliberate one was never cut. The history reads `v0.1.0`,
`v0.2.0`, `v0.3.0`, `v1.1.0`.

**The table above is the rule, and it has been broken once.** `v1.2.1` shipped
`/blood-bank` and `/llms.txt` — two new public URLs and a new week-grid card —
as a PATCH. By the row above it that was a MINOR. Worth knowing before reading
the version numbers as a guide to what changed.

### Cutting a release

The operational checklist is [RELEASE.md](./RELEASE.md); this section is the why.

Bump on `dev` — a `Release vX.Y.Z` PR, squash-merged like any other — then
promote `dev` to `main`:

```sh
npm run version:patch    # or :minor / :major
npm run version:check    # what CI will assert
```

The scripts wrap `npm version --no-git-tag-version`, so they update
`package.json` and the lockfile without creating a tag locally — **the deploy
creates the tag**, and only after Cloudflare has accepted the build.

Leave the version alone and production still deploys — it just doesn't tag. That
is intended for a re-deploy or a `workflow_dispatch` re-run: a tag claims "this
is what production serves", and two deploys of one version would make that claim
twice about different commits.

The trap in that asymmetry is that forgetting is **silent** — production updates,
no tag is cut, and `app-version` goes on reporting a number belonging to
different code. It has happened twice. `.github/workflows/version-guard.yml`
runs `version:check` on every PR into `main` and fails it if the version is
already released, lower than the latest tag, or not valid semver.

Release notes are GitHub's generated notes listing the raw commits.

Tagging happens **after** Cloudflare accepts the deploy, never before, so a
failed deploy leaves no tag behind.

**What's live?** Three ways, in increasing order of trust:

```sh
curl -s https://sdatygerberg.co.za | grep -o '<meta name="app-[^>]*>'
```

The production build stamps `app-version` and `app-commit` into every page's
`<head>`. Local and preview builds set neither and emit nothing, so their absence
correctly means "not a tagged production build". The repo's **Environments** tab
also records each deploy with a link to the site, and the **Releases** page lists
every tagged version.

## Diagnostics

`GET /health` returns `{"status":204,"version":"X.Y.Z"}` — the released version
baked in at deploy time, `Cache-Control: no-store` so a poll never reads a
cached previous release. After a deploy, `npm run smoke -- <origin>
--expect-version <v> --wait-version 180` polls it for up to 3 minutes for the
deployed version; the CI `worker` job runs the same check against `wrangler
dev` on every PR, where it gates ([C-63](./CONCERNS.md#c-63--health-reports-the-deployed-version-for-post-deploy-polling)).

`GET /health` returns `{"status":204,"version":"X.Y.Z"}` — the released version baked in at deploy time, `Cache-Control: no-store` so a poll never reads a cached previous release. After a deploy, `npm run smoke -- <origin> --expect-version <v> --wait-version 180` polls it for up to 3 minutes for the deployed version; the CI `worker` job runs the same check against `wrangler dev` on every PR, where it gates (C-63).

`curl https://sdatygerberg.co.za/api/live-status` returns the resolved
window and a `source`:

| `source` | Meaning |
|---|---|
| `youtube-api` | Checked live |
| `outside-window` | Outside `LIVE_CHECK_CRON`; no API call made |
| `not-configured` | Secrets missing |
| `invalid-schedule` | Bad cron or timezone — fails closed, zero API calls |
| `api-error` | YouTube refused; usually exhausted quota ([C-16](./CONCERNS.md#c-16--one-upstream-verdict-is-shared-or-quota-scales-with-viewers)) |

It also returns `cached`. `true` means the YouTube answer behind this verdict
came from the shared edge entry rather than a fresh call, so it is at most 60s
old. The window and credential checks always run fresh, so `cached` is only ever
`true` alongside `youtube-api` or `api-error` — never `outside-window`
([C-16](./CONCERNS.md#c-16--one-upstream-verdict-is-shared-or-quota-scales-with-viewers)).

The window is checked *before* credentials, so on any day but Saturday you get
`outside-window` whether or not secrets are set. To confirm secrets arrived,
check the deploy log's upload step rather than curling mid-week.

When a broadcast is running it also returns `videoId` and `watchUrl` — the
stream YouTube named, which is what the hero's "Kyk Lewendig" button links to.
Both are `null` whenever `isLive` is false, and can be `null` even while live if
the API answered without an id; the button then falls back to the channel's
`/live` tab. That button renders **only** while `isLive` is true, so on any
ordinary day the hero shows one call to action, not two.


`POST /api/contact` also returns `consentStored` whenever the consent bucket is
bound: `true` means one JSON record reached `consent-cloudkid-link`. A `false`
never fails a submission — the enquiry email carries the consent line either way
([C-34](./CONCERNS.md#c-34--the-consent-record-is-written-before-delivery-and-never-blocks-it)).
Records are keyed `YYYY/MM/DD/<timestamp>-<uuid>.json` and the id appears in the
enquiry email as `Toestemmingsrekord`, so mail and object tie together.
**Retention is a manual dashboard step** — SETUP-INSTRUCTIONS.md §3.6.

`POST /api/contact` returns an `outcome`: `forwarded`, `not-configured`,
`invalid` (with `errors` naming the fields), or `forward-error`. On `forwarded`
it also returns `via` — `email` or `webhook` — naming the channel that carried
it. Email is tried first and the webhook is the fallback; only one runs per
submission ([C-31](./CONCERNS.md#c-31--email-is-tried-first-and-the-webhook-is-the-fallback)).
`not-configured` means *neither* channel is set up.

Every request leaves one entry in Workers Logs (`wrangler tail
tygerberg-sda-website`): connecting address, country, colo, host, method, path,
status, wall time, ray id, and a clipped user agent. It is written after the
response, so it carries the status and the duration, and `run_worker_first` is
`/*` so that it sees every path rather than only the API. The entry is an
object, not a string — Workers Logs extracts the fields of a logged object, so
`ip` and `status` are filterable columns rather than text to search, and `level`
is `log` in the payload rather than inferred from the console method. This is the only place a visitor's address
is visible — analytics counts, it does not name — and nothing is stored: the
entry lives in Workers Logs and is never read back
([C-66](./CONCERNS.md#c-66--every-request-logs-the-visitors-address)).

`/api/contact` verifies a Cloudflare Turnstile token where `TURNSTILE_SECRET_KEY`
is set, and skips the check where it is not (local dev, devtest) —
[C-21](./CONCERNS.md#c-21--abuse-protection-is-cloudflares-and-it-is-off-by-default).
Cloudflare's own Bot Fight Mode / WAF rule remain **off by default**.

## Editing content

All copy and structured content is under `src/data/`, away from components:

| File | Holds |
|---|---|
| `site.ts` | Address, coordinates, external links, service times, building hours |
| `homeCopy.ts` | Homepage copy, weekly schedule, "your first visit" answers |
| `beliefsCopy.ts` | Beliefs-page header copy |
| `beliefs.ts` | All 28 Fundamental Beliefs, bilingual, in 6 categories |
| `departmentHeads.ts` | Carousel roster — 22 people, 14 with headshots |
| `requestCopy.ts` | `/connect` and `/bible-studies` copy, incl. POPIA wording |
| `resources.ts` | External resource links (logos in `public/logos/`) |
| `giving.ts` | `/giving` page copy, EFT banking details, Zapper link |
| `youthGroups.ts` | Sabbath age groups, the Friday evening, the Sabbath window |
| `youthCopy.ts` | `/youth` page copy |

No phone numbers or email addresses anywhere in content —
[C-20](./CONCERNS.md#c-20--popia-shapes-what-the-form-asks-and-what-it-stores).

Adding a page? `src/pages/sitemap.xml.ts` lists routes by hand — nothing
enumerates `src/pages/` for you.

### Zapper on `/giving`

`ZAPPER` in `src/data/giving.ts` has two independent halves, and the section
renders whichever exist. Empty both and the card disappears, along with the
mention of Zapper in the page description.

| Field | Today | Meaning |
|---|---|---|
| `qr` | `zapper-qr.png` | Filename in `public/images/`. Shows a scannable code. |
| `url` | *empty* | A tap-to-pay link. Shows a button. |

**The QR ships; the button does not, deliberately.** The church's code decodes
to `http://2.zap.pe?t=6&i=…`, which is not usable as a link from this site:
it is plain `http` where the site is `https` — a downgrade no payment link
should make — and `2.zap.pe` is not `zapper.com`, so the
`apple-app-site-association` and `assetlinks.json` that let a Zapper link open
the app do not cover it. A code that scans beats a button that might not work.

To add the button, get a current `https://zapper.com/…` payment link from the
merchant portal and set `url`. **Never guess it**: a wrong link sends people's
giving to a stranger's merchant account and nothing on the page would look
wrong.

Replacing the code: export it from the church's Zapper account, then

```sh
node --input-type=module -e "import sharp from 'sharp';
  await sharp('NEW.jpeg').resize(600,600,{kernel:'nearest'})
    .png({compressionLevel:9,palette:true}).toFile('public/images/zapper-qr.png')"
```

PNG rather than JPEG because a QR is two-tone: it compresses better and carries
none of the ringing around the modules that makes a code harder to scan. Decode
the result before committing it and check the payload still names the church.

The homepage video always embeds the channel's auto-generated uploads playlist,
newest-first, no API key. Which video plays never depends on `YOUTUBE_API_KEY`.

### Adding a department-head photo

1. Put the original in `public/images/hod/`.
2. `npm run headshots` — builds its fallback copy, and checks the rest.
3. Set `photo` on that person in `src/data/departmentHeads.ts`: filename only.

Commit the generated fallback too. `public/` is publicly reachable, so a photo
is on a live URL once committed, whether or not a card points at it.

### Icons and the social card

`src/assets/sda-symbol.svg` is the only copy of the artwork; `favicon.svg`,
`map-marker.svg`, `apple-touch-icon.png` and `og-image.png` are committed
derivations — see `tools/README.md` to regenerate. The mark may be recoloured
and nothing else ([C-25](./CONCERNS.md#c-25--the-sda-symbol-may-be-recoloured-and-nothing-else)).

## Findability

`src/layouts/Layout.astro` emits the canonical URL, Open Graph/Twitter tags and
a `Church` JSON-LD block (production builds only — the preview omits
structured data). `site` in `astro.config.mjs` is the single source for
the production origin — change it there and canonicals, OG URLs and the sitemap
follow.

`/robots.txt` is built per environment: the preview answers `Disallow: /` with
no sitemap line, production allows crawling and names the sitemap. The preview
also 404s `/sitemap.xml`, drops `llms.txt`, and sends `X-Robots-Tag: noindex`
— the full no-SEO-dev contract lives in
[C-23](./CONCERNS.md#c-23--the-preview-is-de-seoed-not-gated).

**`/sitemap.xml` still has to be submitted once** in
[Google Search Console](https://search.google.com/search-console). Nobody will
be prompted for this.

## Open items

Needs the church board:

1. **Headshots for 8 of the 22** — Arnold Neuhoff, Lisa Branders, Adéle Meyer,
   Chris Meyer, Gert Coetzee, Peter Wallace, Sanet Stevens, Bertie Hoffman.
   **These eight are not on the site** — a card needs a photo to render
   ([C-29](./CONCERNS.md#c-29--a-head-without-a-headshot-is-not-rendered)),
   so the carousel currently shows 14. Note that the pastor is among the eight.
   Adding the file and a `photo:` line publishes each one.

   Morné Louw, Lané Louw and Morné & Lelani Louw were on this list until 1.2.1,
   when their headshots landed and were referenced. Do not ask the board for
   those three again.
2. ~~**The Ampsdraers 2025/2026 roster is missing an entry**~~ — resolved by the
   board. Laura Rolfe holds Persoonlike Bediening and the
   Strategiesebeplannings-komitee, both of which the roster had listed under
   Jaco van Niekerk; he is head elder only. The cards now follow the board, not
   the PDF.
3. ~~**Children's programme ages**~~ — answered by the children's-ministry
   roster: five groups covering 0-3, 4-6, 7-9, 10-12 and 13-18, all in the
   09:30–11:00 window. They are on `/youth`, which the week grid's Jeugaand card
   links to. The roster's fifteen volunteer names are deliberately not published
   ([C-38](./CONCERNS.md#c-38--youth-names-no-volunteers)).
4. **Weekly ministry schedule** is 4 fixed entries in `homeCopy.ts`. Move to a
   KV/CMS-backed Worker route if it starts changing seasonally.
5. **A photograph for the social card** — `og-image.png` is a typographic card.
   One-file swap at 1200×630; dimensions are declared in `Layout.astro`.

Needs someone with access: **submit `/sitemap.xml`**, and set the Worker secrets
above.

Carrying known risk: **the map ships no tile attribution** —
[C-01](./CONCERNS.md#c-01--the-map-carries-no-tile-attribution).
