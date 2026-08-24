# Concerns

Why the code is the way it is, and what breaks if you change it back.

A living document. Code carries a one-line note and a `C-NN` reference instead
of a paragraph; the paragraph lives here. Add entries as decisions get made,
and amend one when a decision changes rather than deleting the history of it.

The [README](./README.md) covers how to operate and maintain the site. This
file covers the traps.

---

## Licensing

### C-01 — The map carries no tile attribution

`src/pages/map.astro` sets `attributionControl: false`, and nothing renders an
OpenStreetMap credit anywhere on the page. (It was `public/map.html` until
C-47 moved it; the decision below is unchanged.)

**This is a known breach**, decided by the repo owner. OSM tiles come under the
ODbL and the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/),
both of which require a visible credit.

The practical risk is not litigation, it is the OSMF blocking tile requests for
the domain — at which point the map goes blank with nothing in the code to
explain why. That is a human enforcement action, not an automatic one, so it may
never happen; if the map ever does go blank for no other reason, look here
first.

Two ways out if that becomes a problem: restore the credit (Leaflet's own
"Leaflet" prefix is a courtesy and never needed — it is BSD-2-Clause — and the
OSMF guidelines allow the credit *adjacent to* the map rather than on it), or
move to a tile provider whose terms do not require visible attribution.

---

## Images

### C-02 — The headshot originals must never reach a browser

`public/images/hod/TG-DH-*.jpg` are 7-10 MB, ~21 MP studio files. They exist to
be Cloudflare's transform source and nothing else. Every path that could serve
one to a visitor is deliberately closed off — see C-05, C-08 and C-09.

### C-03 — `HEADSHOT_SIZES` and `CARD_WIDTH` are one decision in two files

`HEADSHOT_SIZES` (`src/lib/cdnImage.ts`) tells the browser how wide the card
will render so it can pick a `srcset` candidate. `CARD_WIDTH`
(`AboutCarousel.tsx`) is what actually renders. Change one without the other and
every card downloads the wrong size — silently, and it looks fine on a fast
desktop.

The current values assume the card sits in `max-w-content px-7` (1180px cap,
56px padding) at `w-[72%] sm:w-[45%] lg:w-[31%]`.

### C-04 — The fallback copies must not be narrower than the widest srcset entry

`WIDTH` in `scripts/headshot-fallbacks.mjs` must stay ≥ the largest
`HEADSHOT_WIDTHS` entry. `fit=scale-down` never upscales, so a smaller master
silently serves a smaller image than the layout asked for.

### C-05 — An image can fail before React hydrates

The carousel is server-rendered, so the browser starts — and can finish failing
— the eager images before React attaches any handler. An `error` event that has
already fired is never replayed. `onError` alone therefore misses exactly the
above-the-fold images that matter most.

`Headshot` also checks, as it adopts the node, for an image that is `complete`
with `naturalWidth === 0` — the signature of one that finished and failed.

Symptom if this regresses: the first two or three cards show a broken-image icon
while the rest are fine.

### C-06 — A percentage height inside an `aspect-ratio` box resolves to `auto`

The photo box takes its height from `aspect-ratio` alone, with no height of its
own. `h-full` on a child therefore resolves to `auto`, and a 2:3 portrait
renders at its own ratio — overflowing the box and pushing the name down the
card (361px tall in a 301px box, measured).

The image is positioned `absolute inset-0` against the box instead. Do not
"simplify" it back to `h-full w-full` in flow.

### C-07 — The two image qualities are set to different numbers on purpose

`IMAGE_TRANSFORM_OPTIONS` uses `quality=82`; `scripts/headshot-fallbacks.mjs`
uses 90. They pay for different things.

A transform is per request, and AVIF stops being cheap right after 85. Measured
live at `width=640`: 21 kB at q75, 24 kB at 82, 27 kB at 85, 46 kB at 90,
102 kB at 95. So q90 would roughly double every visitor's bytes for a photo
displayed in a 348px card. 85 is a cheap step up if more headroom is ever
wanted.

The fallback copies are fetched once into the repo and only served when there is
no transformer, so the same step costs repo weight once and nothing per visitor.
SSIM against a lossless render of the same resize, mean over four headshots:
0.9733 at 82, 0.9761 at 85, 0.9812 at 90, 0.9876 at 95 — size climbing far
faster than SSIM past 90.

### C-08 — No `onerror=redirect` on transform URLs

That option hands the visitor the transform's *source* when a transform fails
fatally, and the source is the multi-megabyte original (C-02). The fallback copy
is the right answer and the component reaches it on its own.

### C-09 — The transformer is probed, not assumed

Two mechanisms pick between a transform URL and a fallback copy:

1. `PUBLIC_IMAGE_CDN=false` at build time, for an environment known to have no
   transformer (the devtest Pages build — C-22).
2. One `HEAD` to a `/cdn-cgi/image/...` URL on hydration, shared by every card.

Without the probe each card discovers the answer by failing: a 404 per photo,
and the visitor watches them arrive one at a time. The probed URL is already in
the first card's `srcset`, so the check costs no bytes and no extra billable
transformation.

Until it answers, cards render transform URLs. That is deliberately optimistic —
it matches the server-rendered HTML, so hydration lines up and the visible
images are already in flight.

`fetch` resolving is not success: a 404 page is a perfectly successful fetch, so
the probe checks the status *and* an `image/*` content-type.

### C-10 — Unique transformations are billed per source image per option set

Adding a second variant of `IMAGE_TRANSFORM_OPTIONS`, or another entry in
`HEADSHOT_WIDTHS`, multiplies the count. Keep both lists short.

---

## Carousel

### C-11 — Gesture handling is deliberately kept out of React state

Writing drag offset to React state re-renders every card on every
`pointermove`, and on a phone React falls far enough behind the gesture that the
commit handler reads a distance of zero for a swipe that plainly happened — the
flick gets discarded as a tap. The offset goes straight to the DOM as a custom
property the cards read.

For the same reason both `dx` and `elapsed` come off the event itself:
`timeStamp` is when the browser saw the event, not when the handler ran, and on
a busy main thread a flick judged on handler time reads as a slow drag and gets
rejected.

### C-12 — Card position is modular arithmetic, not accumulated offset

`slotOf` makes every card's position a pure function of `active`, so the ring is
circular in both directions with no duplicated markup and no scroll offset that
can drift out of alignment.

Cards wrap round the back of the ring and jump the full width of the roster when
they do. That jump must never be seen crossing the viewport, which is what
`ANIMATE_SPAN` is for — anything outside it moves without animating.

### C-13 — A visitor who pressed pause meant it

`resetTimer` reads a ref rather than state so that a later swipe or arrow press
cannot quietly restart autoplay. Reduced-motion preference suppresses autoplay
entirely; the arrows still work.

The live region only announces while the deck is *not* moving on its own —
otherwise a screen reader narrates a new name every 4.2 seconds, unasked.

### C-33 — A cancelled swipe is still a swipe

`touch-action: pan-y` is necessary and **not sufficient**. The browser still
arbitrates an ambiguous gesture, and when it decides the page should scroll it
fires `pointercancel` and stops delivering moves. WebKit does this far more
eagerly than Blink, so on iOS a swipe the visitor plainly meant was being
discarded — the deck felt dead on a phone while working on a desktop.

Three things together fix it, and removing any one brings the symptom back:

1. **Axis lock.** After `AXIS_LOCK_PX` of travel the gesture is committed to
   `x` or `y` and stays there. A vertical drag no longer slides the deck
   sideways under a finger that is scrolling.
2. **Claiming the touch.** Once locked horizontal, `preventDefault()` on
   `touchmove` stops the browser taking the gesture. It needs a **non-passive**
   listener, which React's `onTouchMove` cannot provide — hence the manual
   `addEventListener` in an effect. Do not "simplify" it back to a JSX prop.
3. **Settling on cancel.** A gesture already locked horizontal has proven its
   intent, so `pointercancel` settles it on the distance reached instead of
   throwing it away. That is why `dx` is mirrored into the drag ref: the
   cancelling event carries no useful coordinate.

All of it stays in refs and direct DOM writes. No drag state goes through
React — C-11 still holds.

Verified by driving pointer and touch streams together and cancelling
mid-gesture: before, three of six cases lost the swipe; after, none do. The
existing throttled harnesses still pass unchanged (30/30 flicks at 20× CPU,
all seven gesture cases), which is what proves the fix did not buy phone
behaviour at the cost of the race this path was originally written to survive.

---

## LIVE badge and API quota

### C-14 — `LIVE_CHECK_CRON` is a window, not a schedule

It is read as a predicate on the current time, so `* 9-12 * * 6` means "any
minute from 09:00 to 12:59 on Saturdays".

**Keep the minute field `*`.** It decides whether the window is open, not how
often YouTube is polled. `*/5 9-11 * * 6` would close the window for four
minutes out of every five and make the badge blink. Poll rate is
`POLL_INTERVAL_MS` in `useLiveStatus.ts`.

Day-of-week `6` is Saturday — cron counts from `0` = Sunday, so `7` would select
Sunday.

**The window is deliberately wider than the stream.** The church streams
09:00-12:30, but minute and hour are matched independently, so no single
expression means "until 12:30" — `0-30 9-12` would mean the first half of
*every* hour. The choice is 09:00-11:59 or 09:00-12:59.

09:00-12:59 is correct because the window only *permits* polling. The badge
still appears solely when YouTube reports a live stream, so the extra 29 minutes
cost a few API calls and show nothing. Erring the other way would drop the badge
during the last half hour of a service, which is a visible failure.

If the service times move, widen or move the hour field; do not try to encode
the half hour in the minute field.

### C-15 — A malformed window fails closed

A bad cron expression or unknown timezone returns `invalid-schedule` and spends
zero quota, rather than quietly matching everything. `matchField` validates term
*shape* before parsing, because `Number('')` is 0 — a bare `split('-')` would
read `-11` as `0-11` and swing the window open from midnight.

### C-16 — One upstream verdict is shared, or quota scales with viewers

`search.list` costs 100 units against a 10,000/day default — about **100 calls a
day**. The client polls every 5 minutes, so without sharing, each viewer spends
separately: a 30-person hour is ~360 calls, three and a half times the day's
whole allowance, and the badge dies mid-service until Pacific midnight.

`liveStatusCache.ts` puts one verdict in the Cache API for 60s, so every viewer
in a colo rides the same upstream call. That 30-person hour becomes ~60 calls.

**The cache is per-colo, not global** — the true figure is 60 × colos in play,
which for one congregation in Cape Town is usually one. The Cache API is used
rather than a module-global because a global lives only as long as one isolate,
which would barely help.

Concurrent misses can still stampede: arrivals spread across a 5-minute poll, so
that is a few extra calls at the start of a service, not a multiplier. If it
ever needs to be exact, that is what a Durable Object is for.

**`api-error` is cached too, deliberately.** When quota *is* exhausted, retrying
on every request is the worst available behaviour.

`outside-window`, `not-configured` and `invalid-schedule` are never cached: they
cost nothing, and `outside-window` is time-sensitive — caching it could hold the
badge's state across the 12:00 boundary.

Remaining levers if quota is still tight: a narrower window, a longer
`POLL_INTERVAL_MS`, a longer `LIVE_CACHE_SECONDS`, or a raised quota.

### C-17 — The poll loop must never terminate

A failed or unanswerable check reschedules like any other, so the badge recovers
on its own once the Worker or the API comes back. A non-answer also clears the
badge — without that, a 5xx mid-stream would leave LIVE pinned on forever.

### C-18 — The API key must be a Worker secret, never a build-time variable

An Actions secret alone never reaches the Worker. The production workflow
carries the two YouTube values across explicitly via the deploy step's
`secrets:` input.

That step's `env:` block is scoped to the step **on purpose** — hoisting it to
job level puts `YOUTUBE_API_KEY` in the environment during `npm run build`,
where it can reach the client bundle.

---

## Contact form

### C-19 — Success is never reported on a delivery that did not happen

The `outcome` a visitor sees reflects what actually occurred. Leaving someone
waiting for a reply that was never coming is worse than showing an error.

### C-20 — POPIA shapes what the form asks and what it stores

It asks the minimum needed to reply — a name plus an email *or* a phone number,
not both — and will not submit without an explicitly ticked consent box, which
is validated server-side too so a crafted request cannot skip it. The forwarded
payload records `consent` and `submittedAt`, because consent must be
demonstrable after the fact and the church's inbox is the only place the
submission survives.

Related: no phone numbers or email addresses appear anywhere in site content —
they were stripped site-wide, and `/connect` is the compliant route to a person.
Do not reintroduce them, including on the department-head cards.

### C-34 — The consent record is written before delivery, and never blocks it

Consent is given at submission. If the church's mail then bounces, the record of
that consent still has to exist — so `deliver()` builds and stores it *first*.
Doing it the other way round would lose exactly the evidence POPIA asks for, in
exactly the case where you would want it.

The write is best-effort in the other direction: `storeConsent` never throws and
never fails a submission. A visitor who filled in the form is owed delivery to
the church, and a storage fault is our problem rather than theirs. The response
carries `consentStored` for diagnostics only — **C-19 is about delivery, and
this is not delivery.** An unbound bucket omits the field entirely and the
enquiry email still carries its consent line, exactly as before the bucket
existed.

Three things about what is stored:

- **The wording is pinned in `consentRecord.ts`, not imported from
  `requestCopy.ts`.** A record has to state what was agreed to *at the time*;
  pointing at live copy would silently rewrite every historical record the next
  time someone edits the form. Editing the label means adding a
  `CONSENT_VERSION`, never editing the old text.
- **The client sends `lang`** so the record holds the sentence actually on
  screen. Anything unrecognised falls back to `af` rather than rejecting an
  otherwise good enquiry over a language tag.
- **The free-text `message` is deliberately not stored *here*.** It is the most
  sensitive thing a visitor types and it is not part of demonstrating consent.
  C-20's "minimum needed" binds harder on storage at rest than on an inbox.

  **But the deployment stores it anyway, and this entry used to claim
  otherwise.** Every enquiry is blind-copied to `CONTACT_EMAIL_BCC`
  (`notifications@cloudkid.link`), which Email Routing hands to the
  `cloudkid-link-r2-explorer` Worker, and that Worker is configured with
  `targetBucket: "email-notifications"` — so the full message body is persisted
  to R2 as a raw `.txt` dump, in a different bucket, with no retention rule, that
  `wrangler.jsonc`'s own comment says nobody reads. `ConsentRecord` having no
  `message` field is true and beside the point.

  Two places in this repo already suggest dropping that BCC. This is the reason
  to: it is the difference between the paragraph above being a design decision
  and being a POPIA claim the deployment contradicts. Until it is dropped, read
  this bullet as "the *consent record* does not hold the message", not as "the
  message is not stored".

Retention is a dashboard-only R2 lifecycle rule and **is not configured by this
repo** — SETUP-INSTRUCTIONS.md §3.6. Personal data with no expiry is the failure
mode to watch here.

### C-21 — Abuse protection is Cloudflare's, and it is off by default

The Worker validates and forwards; it does no bot detection. Bot Fight Mode and
a WAF rate-limiting rule sit in front of `/api/contact` at the edge.

Neither is on by default, and both need a custom domain — a `*.workers.dev` URL
gets no zone protection. Until they are enabled the endpoint is unprotected.
Turnstile is the next step up and needs code: a widget plus a `siteverify` call
before forwarding.

---

### C-31 — Email is tried first, and the webhook is the fallback

`/api/contact` has two delivery channels and uses exactly one per submission:
Cloudflare Email Sending if it is configured, otherwise `CONTACT_WEBHOOK_URL`.
The webhook is only reached when email is unconfigured *or* fails. That order is
deliberate — email needs no third-party automation account and lands in an inbox
someone already reads — and so is the exclusivity: running both on every
submission would double every enquiry in the church's inbox.

`via` in the response says which channel carried it. It is diagnostic only; the
form ignores it and reads `outcome`, so the existing failure wording is unchanged
whichever channel broke.

Three things bound the email path, and none of them are obvious from the code:

- **It only sends to verified destination addresses on the account.** Sends to
  those are free on every plan and do not touch the sending quota. Sending to an
  arbitrary visitor address is a different product tier, so do not repurpose this
  binding to send confirmations back to the person who filled in the form — it
  will fail with `E_SENDER_NOT_VERIFIED` or eat quota, depending on setup.

  Note the plural. `CONTACT_EMAIL_BCC` adds a second recipient, and *every*
  recipient is checked, so an unverified BCC fails the whole send rather than
  dropping just the blind copy. Adding an archive address can therefore stop the
  church receiving enquiries at all. Put one real submission through the form
  after setting it — `via` in the response tells you which channel survived.

  A "destination address" is also not the same thing as a custom address on your
  own routed domain. `something@yourdomain` that Email Routing forwards onward is
  a *custom address*; the destination is the external inbox behind it. On the free
  path the binding wants the latter.

  **Both configured recipients are custom addresses, not destination addresses.**
  `hello@` and `notifications@` are routing-rule patterns on `cloudkid.link`. Each
  has to be added and verified under **Email Routing → Destination Addresses**
  before the free path will send to it; being a working routing rule is not the
  same permission and does not substitute for it. On the Workers Paid plan the
  question is moot — any recipient is allowed — so which of the two applies
  depends on the account's plan, not on anything in this repo.
- **The sending domain is already onboarded.** This was an open blocker and is
  not one: `cloudkid.link` carries all four Email Sending records — `cf-bounce`
  MX and SPF, `cf-bounce._domainkey` DKIM, and `_dmarc` — alongside the separate
  Email Routing records on the apex. `CONTACT_EMAIL_FROM` is therefore a valid
  sender and needs no further setup. Re-check with:

  ```sh
  dig +short TXT cf-bounce._domainkey.cloudkid.link   # Email Sending DKIM
  dig +short TXT cf2024-1._domainkey.cloudkid.link    # Email Routing DKIM
  ```

  Different selectors, deliberately: onboarding one product does not onboard the
  other, and a domain can have routing without sending.
- **`CONTACT_EMAIL_BCC` currently archives into a script, not an inbox.**
  `notifications@cloudkid.link` is routed by Email Routing to the
  `cloudkid-link-r2-explorer` Worker, which has nothing to do with contact
  enquiries. So the blind copy is at best discarded, and at worst — on the free
  path, where it cannot be a verified destination address — it fails the *whole*
  send and pushes every enquiry onto the webhook fallback. Either point it at a
  second real inbox or drop the line; a BCC nobody reads is not worth the risk it
  adds to the one recipient who does.
- **The three addresses are committed to `wrangler.jsonc`, not Worker secrets.**
  This reverses the original decision and is deliberate, temporary, and written
  up in [ADR-0001](./docs/adr/0001-hardcode-contact-addresses.md) — read that
  before changing it, and revert it when any of its three triggers fires. The
  short version: they are role addresses on the operator's own domain rather
  than personal or church-member data, so publishing them costs spam to three
  controlled mailboxes, and it buys a self-contained deploy plus the fence below.
- **The binding is fenced by `allowed_destination_addresses` and
  `allowed_sender_addresses`.** This was impossible while the addresses were
  secret — naming them in the fence would have published them, which was the
  thing being avoided. Public addresses make it free, and it bounds the blast
  radius: a bug in `contactEmail.ts` cannot mail a stranger, it fails.

  The fence duplicates the addresses inside `wrangler.jsonc`. Change one list and
  not the other and Cloudflare rejects the send.

A missing binding or a missing value is not an error: `sendContactEmail` returns
false and delivery moves on. That is what keeps a partial configuration working
rather than throwing.

---

### C-32 — Visitor input is flattened before it reaches a header

`name` is only length-checked on the way in, so it can still hold a CR or LF. Put
raw into the subject, that is header injection — a submitted name ending
`\r\nBcc: someone@example.com` becomes a real header. `headerSafe()` strips
control characters and collapses whitespace before the name is interpolated, and
clamps the result so a 200-character name cannot run away with the subject line.

The platform encodes headers itself, so this is belt to that braces. Keep it
anyway: it costs one `replace` per submission, and the failure it prevents is
silent — a redirected copy of every enquiry, visible to nobody.

The visitor's email address goes into `replyTo` unflattened, which is safe for a
different reason: the validating regex is `[^\s@]+@[^\s@]+\.[^\s@]+`, and `\s`
excludes CR and LF, so an address that passed validation cannot contain a line
break. Everything else the visitor typed goes in the body, where a newline is
just a newline.

---

## Environments

### C-22 — The devtest build has no Worker and no transformer

GitHub Pages serves static files only, so `/api/*` and `/cdn-cgi/*` do not
exist there. `PUBLIC_HAS_API=false` skips the live-status poll and renders the
contact form read-only; `PUBLIC_IMAGE_CDN=false` serves the fallback headshots
(C-09).

### C-23 — The preview advertises production canonicals

The Pages copy is publicly crawlable and cannot be covered by a `robots.txt` —
that only works at a domain root we do not own. `PUBLIC_INDEXABLE=false` emits
`noindex,nofollow` and `canonicalPath` strips the Pages base so canonicals point
at production. Both exist to stop the preview competing with the real site in
search results.

### C-24 — Unhashed assets get `max-age=0` unless told otherwise

Workers static assets default to `max-age=0, must-revalidate`, which pins every
Cloudflare image variant to a 300s floor and has the transformer re-pulling a
multi-MB original all day. `public/_headers` sets a week on `/images/hod/*`.

A week rather than a year because these filenames carry no content hash, so
replacing a photo reuses its URL; a cache purge makes a swap immediate and this
bounds how long a stale copy can linger for anyone who missed it.

---

## Identity

### C-25 — The SDA symbol may be recoloured and nothing else

`src/assets/sda-symbol.svg` is the only copy of the artwork, reproduced from the
official version. It is a General Conference trademark used by a member
congregation, and the identity system governs its proportions — it must never be
redrawn, simplified or distorted to fit a layout, including to make it legible
at small sizes (C-27).

`favicon.svg`, `map-marker.svg` and `apple-touch-icon.png` are committed
derivations. Their path data is byte-identical to the source.

`Logo.tsx` imports it as raw markup (`?raw`) rather than as an `<img>` so it
inherits `currentColor` — navy on cream headers, cream on navy footers, from one
file.

### C-26 — An SVG needs a default `xmlns` to render as a standalone file

`favicon.svg` once declared `xmlns:svg` but no default `xmlns`, inherited from
the source artwork. That renders fine *inline*, which is why every check passed,
but it is invalid as a standalone image and the favicon silently drew nothing.

Verifying that a file *contains* the right path data is not the same as
verifying a browser will *draw* it. Assert `naturalWidth > 0`.

### C-27 — The favicon needs a plate at 16px

The bare navy mark is `#0b3d54` on a `#202124` tab strip: almost no contrast,
and at 16px it reads as a smudge. On a light strip the same file is fine, so
this is specifically a dark-mode failure.

The mark is reversed out of a navy plate, which gives both tones something to
contrast against whatever the strip is doing, and matches how
`apple-touch-icon.png` already treats it.

A plate rather than a recolour or a `prefers-color-scheme` swap because the
16px problem is not only contrast: the flame's internal strokes merge at that
size whatever colour they are, and the artwork cannot be redrawn to simplify
them (C-25). A plate keeps the silhouette identifiable once the detail is gone.

The map marker keeps the bare mark — at 40px over map tiles it already reads,
and a plate there is chrome the map does not need.

---

## Map

### C-28 — One-finger drag is disabled on touch

The map sits in an iframe partway down a long page. With dragging on, a thumb
that lands on it pans the map instead of scrolling the page and the visitor is
stuck. Disabling the gesture is what removed the need for a "tap to interact"
overlay covering the map.

Zoom buttons still work, mouse dragging still works on desktop, and the
directions links above the map handle real navigation.

---

## Roster

### C-29 — A head without a headshot is not rendered

`shownDepartmentHeads` filters `departmentHeads` down to entries that have a
`photo`, and the carousel renders only those. A photoless card was a striped
box reading "HOD photo": on a page whose purpose is to introduce people, an
empty frame reads as neglect rather than as a photo still to come.

**The roster in `departmentHeads.ts` stays complete** — it is the record of who
holds what, and shortening it would lose that. Only the rendering is filtered.

The consequence to keep in view: **14 of 22 are currently on the site, and the
pastor is one of the eight who are not.** Anyone asking why a particular person
is missing wants a headshot, not a code change. Adding the file and a `photo:`
line publishes them, with nothing else to touch.

The predicate is a type guard, so `Card` receives `photo: string` and the
component has no placeholder branch left to fall through to. If every entry
loses its photo the carousel returns `null` rather than dividing by zero in the
ring arithmetic (C-12).

### C-30 — A drag that starts on a headshot must still work

The photo fills the card, so a drag to work the deck almost always starts on an
`<img>`. Images are draggable by default: the browser begins its own image drag,
the pointer stream stops arriving, and the swipe dies halfway with the deck
rubber-banding back. `draggable={false}` is what prevents that, and it is not
decoration.

The same reasoning covers `select-none` on the track (a slow drag across a name
would otherwise highlight text rather than move the deck) and
`-webkit-touch-callout: none` on the image (iOS offers "Save Image" on a press
that was meant as the start of a swipe).

Emulated touch does not reproduce any of these — the native image drag only
showed up under a real mouse drag, and the callout needs a device. Do not
conclude they are unnecessary because a touch harness passes without them.

### C-38 — /youth names no volunteers

The children's-ministry roster the board circulated names a leader and one to
three assistants for each of the five Sabbath age groups — fifteen people.
`youthGroups.ts` carries the age bands and the group names and **none of those
names**, which is a decision and not an omission.

Two reasons, and either would be enough.

The page answers a parent's question: *is there something for my
eight-year-old, and when.* A name does not answer it, and fifteen of them bury
the five age bands that do. A visitor who wants a person is already served by
the carousel on the home page.

The other is consent. The department heads on `departmentHeads.ts` hold church
offices and are published as such. A Sabbath-morning assistant volunteered to
help with a class, which is not the same thing as agreeing to appear on a
public web page, and nobody asked them. C-20 keeps contact details off the site
outright; a name is a lower bar than a phone number, not no bar at all.

If the board decides otherwise, the type has room for it and the ask is a
per-person one — get it from the fifteen, not from the roster.

## This week

### C-36 — The blood bank filter reads the clock after mount, not during render

`BLOOD_DRIVES` is a fixed list and the build is static, so a `d >= today()`
filter evaluated while rendering would be frozen at whatever day the deploy
ran. It would keep showing a drive that happened weeks ago until someone
happened to deploy again — and deploys are driven by content changes, not by
the calendar.

Reading the clock in `useEffect` fixes that, but the reason the state starts at
`null` rather than at today's date is different: the server render and the
first client render have to produce the same markup. Seeding it with
`today()` would have the server emit the build-day list and the browser emit
the visit-day list, which is a hydration mismatch on a `client:load` island.
Starting at `null` means both render the full list, and the filter narrows it
one tick later.

The cost is that the pre-hydration HTML — which is what a crawler without
JavaScript reads — lists dates that have already passed. That is the year's
published roster rather than anything false, so it was accepted rather than
worked around.

Do not "simplify" this by filtering at module scope. That runs at build on the
server and at load in the browser, which is the mismatch again, only harder to
see.

It lives in `useUpcomingDrives` rather than in either component because the home
page card and `/blood-bank` both need it, and two copies of this would be two
chances to seed one of them with today's date and reintroduce the mismatch on
one page only.

### C-37 — The blood bank page takes no bookings

`/blood-bank` publishes dates and slots and stops there. It has no form, asks
for no name and no phone number, and stores nothing — so there is no personal
data to protect and no consent to record, which is the whole reason it can be a
static page with no Worker route behind it.

Adding "book a slot" is not a small change. It would mean a submission path, a
consent box and a stored consent record, all of which `/api/contact` already
carries the machinery for (C-20, C-34) — reuse that rather than growing a second
one. A slot count is also not a booking count: nothing here knows how many
places are left, and the card must not be read as saying otherwise.

## Discovery

### C-35 — `llms.txt` restates facts it cannot read

`public/llms.txt` follows [llmstxt.org](https://llmstxt.org/): an H1, a
blockquote summary, prose, then H2 link lists. Being a flat file served as
text, it cannot import `SITE` or `SERVICE_TIMES`, so the address, the three
service times, the opening hours and the page list are all typed out a second
time.

That makes it the same shape of trap as C-03. Change a service time in
`src/data/site.ts` and every rendered page updates while `llms.txt` goes on
telling agents the old one — silently, because nothing builds it and nothing
checks it. `site.ts` carries a pointer back here for that reason.

Absolute production URLs throughout, deliberately. The file is copied verbatim
to whatever origin serves it, so a devtest build advertises the production
addresses rather than its own — the same call as C-23, and for the same reason:
a preview must not invite anyone to treat it as the real site.

---

## The August 2026 audit

C-39 through C-56 all come from one review of the whole repository. Several of
them are the same shape: a comment stating something the code had stopped doing.
Where that happened the comment is now either true or gone.

### C-39 — Two oranges, because one cannot serve both grounds

**Reversed by C-59.** The palette below shipped to devtest, was rejected on
looks, and the handoff orange is back as a single token. The measurements here
still hold — they are why C-59 is a knowing trade rather than a fix.

The handoff's `#e8862c` measured 2.39:1 as text on cream and 2.67:1 under a
white button label — the fill on every primary call to action. Both fail
WCAG 1.4.3 (4.5:1). Darkening it far enough for the light grounds pushes it to
2.02:1 on navy, where orange text also lives, so no single value works.

- `--color-orange: #924e0f` — the light-ground value. White on it is 6.33:1.
- `--color-orange-on-navy: #f0a15a` — 5.50:1 on navy, 7.09:1 on navy-deep, and
  visually the brand orange, which is why the dark sections keep it.

The exact light-ground value is set by the tightest ground on the site, which is
not the page: an eyebrow on a `bg-orange/10` panel has only the 10% tint between
it and its own colour. `#9a5410` measured 4.47:1 there. `#924e0f` measures 4.94.

`--color-slate-muted` went `#5c6b73` → `#55646b` for the same reason: 4.48:1 on
tan was the one body colour that missed.

Anything on a navy ground took the `-on-navy` token, and a filled control there
took a `text-navy-deep` label rather than white. Both are gone under C-59.

### C-40 — The focus ring is two rules

One `:focus-visible` rule painted a 3px orange outline everywhere. On an orange
button that is **1.00:1** — the same colour — so a keyboard user tabbing onto the
primary CTA saw nothing at all, and it failed SC 1.4.11 (3:1) on every light
ground besides.

The comment above it said orange "is the only token in the palette with enough
contrast against both the cream page and the navy bands and buttons". Navy on
cream is 10.39:1 against orange's 2.39:1, so navy is strictly better on light;
and orange on orange is 1.00:1, the one case the rule existed to cover.

Navy is the default; `:is(.bg-navy, .bg-navy-deep, .bg-black) :focus-visible`
inverts it to cream inside the dark sections. Keyed off the background utility
so a new dark section gets the right ring without anyone remembering.

`outline-offset: 2px` is load-bearing: the ring is drawn clear of the element,
so what it must contrast with is the ground behind it, not the fill it surrounds.
For the same reason the language toggle carries no `overflow-hidden` — it clipped
each pill's ring to a sliver — and rounds its end buttons instead.

Two rules cover everything that takes the default outline. The form inputs opt
out on purpose: `RequestForm` sets `focus:outline-none` and draws its own
`focus:ring-2 focus:ring-navy/15` with a `focus:border-navy`, which is a stronger
signal on a field than an outline around it. That is a deliberate exception, not
a gap.

### C-41 — The language toggle says which language is active

`bg-orange text-white` on the selected pill and nothing else — no `aria-pressed`,
no `aria-current`, no ARIA of any kind. A screen-reader user could not tell which
language was on, and the control leaned on colour to carry state (SC 1.4.1).
Both buttons now carry `aria-pressed`, the pattern the carousel's pause button
already used.

### C-42 — The sticky category bar has two offsets

`SubPageHeader` is 63px at `py-2.5` and 71.5px from `sm` up at `py-3.5`. The
beliefs category bar was pinned at `top-[63px]` alone, so from 640px up it parked
8.5px behind the header, which wins at `z-50` against the bar's `z-40`. Measured
at 390/640/768/1280.

### C-43 — A disclosure panel is always rendered, and hidden when closed

The accordions set `aria-controls` unconditionally but rendered the panel only
while open, so every collapsed control referenced an id that was not in the
document — 28 of 28 on `/beliefs`, 5 of 6 on the homepage. `hidden` when closed
instead. It also puts the belief text in the served HTML, where a crawler reads
it — a reader without JavaScript still cannot open a panel, but the words are now
in the document rather than absent from it.

### C-44 — What the page says before it hydrates has to be defensible

C-36 explains why the clock is read after mount. It does not address what the
un-narrowed first render *says*: seeded with the whole roster, the static HTML
named a blood drive four months past and 27 sessions where the mounted page says
12. That is what a crawler indexes.

`PUBLIC_BUILD_DATE` is set once in `astro.config.mjs` and read as
`import.meta.env.PUBLIC_BUILD_DATE`, so it is the same value in the static HTML
and in the bundle and cannot cause a hydration mismatch. The drive list, the
sitemap's `lastmod` and the footer's copyright year all read it.

**Not `vite.define`.** That was the first attempt and it fails in exactly one
place: Vite applies user defines to the *server* consumer under `astro dev`, so
the client module was served with a bare `__BUILD_DATE__` identifier and every
island on the homepage threw `ReferenceError` on hydration. The built site was
fine, which is the worst shape for a bug like this. A `PUBLIC_` variable is
inlined for both.

### C-45 — A checkout with no tags is not a first release

`git tag -l "v*"` on a shallow clone succeeds with empty output — it does not
throw — so `check-version.mjs`'s `try/catch`, whose message named that exact
case, could never fire for it. The script read zero tags as "first release" and
exited 0, waving through a version that was already released: the silent
promotion it exists to stop. It asks `git rev-parse --is-shallow-repository`
now, and a genuine first release still passes, loudly.

### C-46 — The player is deferred, the poster frame is the next step

The hero `<iframe>` carried no `loading` attribute while the map below it was
lazy. On a phone the player stacks under the hero copy and starts offscreen, so
`loading="lazy"` genuinely withholds the YouTube bundle — which is larger than
the entire first-party homepage — until it is scrolled to. On a desktop it is
above the fold and lazy does nothing; a click-to-load poster would.

### C-47 — The map is a page, not a file in `public/`

`public/map.html` answered a 307 to `/map` in production before the iframe began
loading Leaflet, and retyped the coordinates and the address that `site.ts`
already held. As `src/pages/map.astro` it is served at its own URL with no
redirect and reads both from the same place as everything else.

**`/map.html` still resolves**, which was not obvious and was worth checking
rather than assuming. Workers static assets default to
`html_handling: "auto-trailing-slash"` and `wrangler.jsonc` sets no override; that
handler's `.html` branch falls through to `<path>/index.html` and redirects to
`<path>/`, which `dist/map/index.html` matches. Confirmed against the real asset
worker under `wrangler dev`: `/map.html` → 307 → `/map/` → 200. No public URL was
removed, so MINOR is right by the letter of the README's table rather than in
spite of it.

Two things the move broke and had to be put back:

- The marker path had to become absolute. A relative `map-marker.svg` resolved
  against `/map/` once this stopped being a file at the root.
- The `<style>` block needs `is:global`. Every selector in it targets an element
  Leaflet creates at runtime, and Astro's default scoping rewrites them to
  `.church-marker[data-astro-cid-…]`, which matches nothing a script appends
  after hydration. The marker lost its cream ring and the popup its type styling,
  with no error anywhere.

### C-48 — Leaflet is pinned and hash-checked

The map loaded `leaflet@1.9.4` from unpkg with no `integrity`, so anything that
host served would have run with full access to the document. The hashes are of
the exact bytes; `crossorigin="anonymous"` is required for SRI to be enforced at
all on a cross-origin fetch.

The CSP in `public/_headers` is generated by `scripts/build-headers.mjs`, which
hashes every inline script in the build — Astro's island loader and this page's
`define:vars` block — because a `script-src` without `'unsafe-inline'` allows an
inline script only by hash.

### C-49 — The address exists once, in parts

`structuredData.ts` said "both read from `src/data/site.ts`, so there is nothing
to sync" above five hardcoded literals, one of which had already drifted: the
JSON-LD said `Boston, Bellville` where the site displayed `Boston, Cape Town`.

`SITE.addressParts` holds street, suburb, town, city, region, postal code and
country. `SITE.address` composes the published string from them and the JSON-LD
`PostalAddress` takes the schema.org fields from the same object. A test asserts
both, so the comment cannot go stale again.

The two still name **different levels of the same hierarchy**, and that is
deliberate: the printed address ends "Cape Town, 7530" because that is how the
church writes it, while `addressLocality` is `Bellville`, which is the town
schema.org is asking for. Boston is the suburb and rides on the street line. What
was wrong before was not that the two differed — it was that they were two
unconnected literals, so nobody could tell whether a difference was a decision or
a typo.

### C-50 — A pause button is only shown when there is autoplay to pause

Under `prefers-reduced-motion` the deck never advances, but the pause control
still rendered and pressing it flipped `aria-pressed` and the label while
controlling nothing — the pause branch cleared a timer that did not exist and the
resume branch was gated behind `!reduceMotion`. It reported playing/paused state
for a carousel that was never playing. Not rendered under reduced motion; the
prev/next controls still work.

### C-51 — The masters are closed to everything but the transformer

C-02 says the originals "exist to be Cloudflare's transform source and nothing
else". That was true of every path the site's own markup takes and false of the
plain URL: 14 files, 104 MB, each a ~21 MP portrait with camera EXIF intact,
every one a 200 with a week-long cache, and the filenames are in the srcset.

The Worker rewrites `/images/hod/*.jpg` to the `fallback/` copy unless the
request carries `image-resizing` in `Via`, which is how Cloudflare marks its own
transform subrequest.

**This needs `run_worker_first` to work at all.** By default a URL that matches a
file in the assets directory is served straight from the asset store and the
Worker is never invoked — so the guard sat in `index.ts` doing nothing until
`wrangler.jsonc` named the path. The negative pattern keeps `fallback/` on the
default asset path: those are what a browser is meant to get, and every Worker
invocation there is a billable request for an image that needs no logic.

**A rewrite rather than a 404, and that is the safety margin.** If the marker
ever does not arrive, the transformer reads the 1400px fallback as its source
instead of an error page — and the widest srcset candidate is 1280, so the
result is the same picture. There is no failure mode here that breaks a card.

**It is not a security boundary.** `Via` is a request header and anyone can send
one. This closes the accidental door — browsers, crawlers, anyone reading the
srcset. Moving the masters off the public origin is the real fix and needs an
account change this repo cannot make.

The devtest Pages artifact drops them entirely: `PUBLIC_IMAGE_CDN=false` sends
every card to `fallback/`, so they were 104 MB uploaded and served to nobody.

### C-52 — One headshot generator

`scripts/headshot-fallbacks.mjs` and `tools/build-headshots.mjs` wrote the same
files from the same sources and disagreed on three things: quality (82 against
C-07's measured 90), whether to apply EXIF rotation, and whether to validate.
`npm run headshots` pointed at the one that had all three wrong.

The missing `.rotate()` was the sharper risk. Every current master is orientation
1, so nothing was broken — but a photo straight off a camera at orientation 6
would have written a sideways fallback while Cloudflare's transform rendered it
upright, so the card would be correct in production and rotated 90° everywhere
there is no transformer, with nothing reporting it.

Not hypothetical, and the attribution is the interesting part: regenerating all
fourteen with the settings this script now carries reproduced thirteen byte for
byte — `tools/build-headshots.mjs` had written those — and changed
`TG-DH-Louws.jpg`, the one file this script had built itself, at its old q82.
Verified by reproducing both recipes with sharp against the committed bytes.

So the generator `package.json` pointed at is the one that had produced exactly
one of the fourteen, and it produced the only wrong one. The settings that
survive here are the deleted script's.

The validation used to sit below the `existsSync` skip, so the only files ever
checked were the ones being created in that same run. It runs on every file now,
and checks that an existing fallback is the width it should be.

### C-53 — A clock time or a service name is typed once

Four separate places restated values they could import:

- `homeCopy.firstVisit` hand-typed "09:30 tot 11:00" and "Erediens" on the
  strength of a comment in `youthGroups.ts` saying neither file could import
  it — while `homeCopy.ts`'s second line already imported from that file. The
  service name had to be corrected by hand in v1.3.1 for exactly this reason.
- The midweek card times were typed once per language, although a clock time is
  not language-specific — with the Jeugaand entry three lines below importing
  its range instead, so the right pattern was inside the same literal.
- `youthCopy`'s meta descriptions hardcoded the evening range and "0 tot 18",
  punctuating the range differently from `youthEveningRange` as they did it.
- `homeCopy.beliefTitles` / `beliefDescs` held the six theme names and
  descriptions in both languages that `beliefCategories` already held — 24
  strings that happened to match with nothing keeping them that way.

`SERVICE_TIMES` entries carry a stable `id` so prose can name one without
depending on array order.

### C-54 — The skip link is bilingual

It is server-rendered because it has to work on the first Tab press, before any
island hydrates, so it cannot read the language context. It was Afrikaans only,
including for a reader who had toggled — and the toggle switches
`documentElement.lang` to `en`, so a screen reader announced Afrikaans words
with English pronunciation. Both, each in its own `lang`, the way `404.astro`
already answered the same constraint.

### C-55 — The sitemap carries `lastmod`

It emitted `<priority>` and no `<lastmod>`, which is the element crawlers
actually read. The build date, not a per-page timestamp: every page ships in one
deploy, and a hand-maintained per-page date is how a `lastmod` starts lying.

### C-56 — The consent metadata identifies nobody, on purpose

The comment claimed the R2 `customMetadata` was "enough to audit a date range or
find one person's records from a listing alone". It holds `topic`, `submittedAt`
and `consentVersion`. Nothing there identifies a person, so a POPIA access or
deletion request means reading the object bodies.

The code is right and the comment was wrong. Putting a name or an email into
object metadata would make every listing a disclosure — the worse fix.

### C-57 — The six themes live apart from the 28 beliefs

`BeliefsSummary` renders the six theme names and summaries on the homepage.
Reading them from `beliefCategories` deduplicated the strings and cost the
homepage 8.1 kB gzipped: a static import pulled `beliefs.ts` — all 28 beliefs,
both languages, full descriptions — into `Home.js` to render six lines.

`beliefThemes.ts` holds the six name/desc pairs and nothing else. `beliefs.ts`
imports it and composes each category from a theme plus its items, so the names
still exist once, and the homepage imports only the small module. Vite splits on
the module boundary, so this only works while the two stay in separate files.

### C-58 — The workflow actions sit on floating major tags

All four workflows ran on actions whose majors pinned the Node 20 runner, which
GitHub has deprecated. Bumped to `checkout@v7`, `setup-node@v7`,
`configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5` and
`wrangler-action@v4` — every one of them a node24 runner.

Two of those majors carry a behaviour change rather than just a runner bump, and
both are inert here:

- `upload-pages-artifact@v5` excludes dotfiles from the artifact unless
  `include-hidden-files: true`. `dist/` has none, and nothing wants a
  `.nojekyll` — the artifact path to Pages does not run Jekyll.
- `wrangler-action@v4` changes `DEFAULT_WRANGLER_VERSION` from `3.90.0` to `4`.
  The deploy job does not set `wranglerVersion`, and the action returns the
  already-installed CLI when that input is absent, so `npm ci` decides the
  version and `package.json` pins `wrangler@^4`. The default is never reached.
  Set `wranglerVersion` and it would be, so leave it unset.

`setup-node@v7` drops `always-auth` (unused) and adds `package-manager-cache`,
which auto-enables caching off a `packageManager` field in `package.json`. There
isn't one, so the explicit `cache: npm` is still what caches.

Floating majors rather than pinned SHAs, which is what the repo already did.
That trades supply-chain pinning for not having to bump a patch by hand; a repo
holding no secrets on the PR path is the case where that trade is defensible,
and the production workflow's secrets are the reason to revisit it if it ever
stops being.

### C-59 — One orange again, and it does not pass on the light grounds

C-39 split the brand orange in two so both grounds could clear WCAG AA. That
shipped to devtest, the church looked at it, and the darkened light-ground value
was rejected: it reads brown rather than orange on cream, which is most of the
site. The instruction was to put the handoff colour back everywhere.

So `--color-orange` is `#e8862c` again, `--color-orange-hover` is `#c06a1a`, and
the `-on-navy` pair is deleted. Every `orange-on-navy` usage collapses back to
`orange`, and the filled controls on navy take a white label again.

What this costs, stated plainly so nobody has to re-derive it:

- `#e8862c` as text on cream is **2.39:1**, against the 4.5:1 that SC 1.4.3 asks
  for body-size text. This is the eyebrow labels, the `→` arrows and the inline
  links on every light section.
- White on `#e8862c` is **2.67:1** — every primary button label.
- On the navy bands it measures **5.31:1** and passes, which is why one token
  serves the whole site again rather than needing a second.

The accessibility work that did *not* depend on the value stays: the focus ring
is still navy on light and cream on dark (C-40), the language toggle still
carries `aria-pressed` (C-41), and `--color-slate-muted` stays at `#55646b`.
Those fix contrast and state signalling without touching the brand colour.

There are two ways to recover AA without changing the orange, and neither was
taken here because both change the look in their own right:

- a dark label on the orange fills instead of white, which is what the deleted
  `-on-navy` token already did on the navy side;
- larger or heavier orange text, since SC 1.4.3 relaxes to 3:1 at 18.66px bold
  or 24px — though at 2.39:1 the eyebrows would still miss even that.

Whoever picks this up next: the value is a decision, not a defect. Change it
only if the church asks.

### C-60 — `run_worker_first` as a list is the whole set, not an addition

C-51 added `run_worker_first: ["/images/hod/*", "!/images/hod/fallback/*"]` so the
Worker could see a direct hit on a headshot master. It did that. It also silently
took `/api/live-status` and `/api/contact` out of service in production.

The array form is not "run the Worker first for these as well as the usual". It
is the entire set of paths that reach the Worker script at all. Everything else
is answered by asset serving on its own, and with `not_found_handling: "404-page"`
a path with no file behind it gets `404.html` — a 200-shaped HTML error where an
API response belongs. Cloudflare's own example says so plainly: "All other
requests either serve an asset that matches or serve the index.html fallback,
without ever hitting this code."

So the fix is one entry: `["/api/*", "/images/hod/*", "!/images/hod/fallback/*"]`.
**Adding a route to `src/worker/index.ts` now means adding its path here too.**
Nothing in the type system or the build connects the two.

The second failure was the Content-Security-Policy from C-48, and the fix for it
was wrong. The console said `Framing 'https://www.google.com/' violates ...`, so
`google.com` and `youtube.com` were added to `frame-src`. That did let the frame
through, and what came through was a redirect loop: the card rendered Chrome's
"redirected you too many times" page where the video belongs.

So the CSP was never the cause. It was hiding a broken embed, and widening the
policy only changed the failure from silent to loud. `frame-src` is back to the
C-48 value, which is the state a visitor is least badly served by, and the video
not playing is recorded here as open rather than as fixed.

Whoever picks it up: the redirect is JS-driven inside the player, so it does not
show in the HTTP response — `curl -L` on the embed URL is a clean 200 with zero
redirects, and `videoseries?list=`, `?listType=playlist&list=` and the
`youtube.com` host all return the same bytes. It needs a real browser with
network access on the actual page. Do not re-add `google.com` on the strength of
the console message alone; that is exactly the reasoning that produced this.

### What actually let both reach production

Not the mistakes themselves — the absence of anything that looks at the running
site. Typecheck passed. Twenty-six tests passed. The build passed. `wrangler
deploy` reported success and the release was tagged. Every gate was green while
the contact form returned an error page, because every gate examined the artifact
and none examined the deployment.

`scripts/smoke.mjs` is the missing gate. It runs against the origin that was just
deployed, in the production workflow *between* the deploy and the tag — a release
tag pointing at a deploy that does not serve is worse than no tag. It checks that
every page renders, that `/api/*` answers with JSON rather than HTML (naming this
concern in the failure message, because the symptom looks nothing like the
cause), that the C-51 guard still serves the fallback for a plain master URL, and
that the security headers and CSP are present.

It was written against broken production first: exit 1 with the right diagnosis
before the fix, exit 0 after. A smoke test that has never failed is a smoke test
nobody has tested.

It also failed its own first deploy, which is worth recording rather than
quietly fixing. The flag was `--no-api`, on the assumption that the only thing
devtest lacks is the Worker. It lacks two things: `public/_headers` is a
Cloudflare mechanism, and GitHub Pages never interprets it — the file uploads and
answers 200 while the response carries no CSP and no security headers at all. So
a healthy devtest deploy went red on six checks, five of them headers and the
sixth a `frame-src` comparison against a policy that was not there. The flag is
`--no-edge` now and gates both, because the distinction that matters is whether
Cloudflare is in front, not whether a Worker exists.

Then it failed its first *production* run, differently: every page came back 403
and the release tag was skipped for a deploy that was serving correctly. The
first reading was rate limiting — a dozen rapid requests from a datacenter IP
with `node` as the User-Agent — so the script got a browser User-Agent and
retried 403/429 instead of treating them as a verdict.

That was wrong, and the second production run proved it: 403 on all twelve
checks again, after four retries each, with the browser User-Agent. **Cloudflare
blocks GitHub Actions runners outright**, not as a burst limit. The identical
checks from anywhere else pass every time.

Which means the production smoke test cannot gate anything, and building a gate
that structurally cannot pass gives you either a permanently red pipeline or a
check everyone learns to ignore. So the script now separates *blocked* from
*broken*: a run where every single check failed and the edge status was 403/429
is *inconclusive* — it exits 0 with a loud warning, because a site that is
genuinely down does not also refuse the request that would prove it. Any mixed
result means the edge is letting this client see the site, so a failure among
those is real and still exits 1.

**The proper fix is on the Cloudflare side** and needs dashboard access: a WAF
skip rule for the GitHub Actions IP ranges, or for a shared secret header the
script sends. Add one and the `process.exit(0)` branch stops being reachable and
the gate becomes real. Until then the production run reports and does not
block.

The general lesson is the one this file keeps relearning: a check that has only
ever been run against one shape of target has only been tested against one shape
of target. Three are exercised now — `--no-edge` against the live Pages URL, the
full set against `wrangler dev`, and the full set against production. A fourth
case is worth keeping in mind: run it against Pages *without* `--no-edge` and it
correctly reports ten failures, which is how you can tell it still fails when it
should.

Two honest limits:

- The devtest run passes `--no-edge`, because Pages has neither a Worker nor the
  headers. That run cannot catch this class of bug — and with the production run
  reduced to advisory by the block above, **nothing in CI currently catches it**.
  The `wrangler dev` check that found it is a local step. Making that automatic
  means a `wrangler dev` job in CI, which would also sidestep Cloudflare
  entirely; that is the better fix and is not done here.
- `fetch` has no default timeout, so the script carries three bounds: 10s per
  request, a 150s whole-run deadline past which every remaining request fails
  immediately, and `timeout-minutes: 5` on both workflow steps.
- **The success path has to call `process.exit(0)`, and the reason is worth
  keeping.** It used to fall off the end and rely on Node's event loop
  draining, which `fetch` does not guarantee: undici keeps its connection pool
  alive after the last response, and a socket the far side has not closed keeps
  a process running with no work left to do. Two production deploys in a row
  then sat on this step indefinitely *after the deploy itself had succeeded*.
  The diagnostic that cracked it: the runs that **failed** finished cleanly,
  because failure and inconclusive both exit explicitly and only the all-passed
  path did not. A check whose healthy outcome is the one that hangs is the
  worst possible shape — it blocks the release precisely when nothing is wrong.
  It also cost two wrong diagnoses along the way, one blaming Cloudflare and
  one blaming GitHub, before the evidence was read properly.
- The production step is `continue-on-error: true`. That is a retreat from the
  original intent and is meant to be temporary: a check that Cloudflare answers
  403 reports on a deployment it never observed, so gating on it buys nothing
  and costs every release. Delete that line once a WAF skip rule exists.
- It cannot catch the `frame-src` half. The blocked frame is constructed by the
  YouTube player at runtime; the static check here compares `frame-src` against
  the iframes in the markup, and `google.com` is not one of them. Only a real
  browser loading the page would see it. That check is worth adding if a second
  CSP surprise ever ships.
