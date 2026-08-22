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

`public/map.html` sets `attributionControl: false`, and nothing renders an
OpenStreetMap credit anywhere on the page.

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

`MASTER_WIDTH` in `tools/build-headshots.mjs` must stay ≥ the largest
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

`IMAGE_TRANSFORM_OPTIONS` uses `quality=82`; `tools/build-headshots.mjs` uses
90. They pay for different things.

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
   transformer (the devtest Pages build — C-21).
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
- **The free-text `message` is deliberately not stored.** It is the most
  sensitive thing a visitor types and it is not part of demonstrating consent.
  C-20's "minimum needed" binds harder on storage at rest than on an inbox.

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

The consequence to keep in view: **11 of 22 are currently on the site, and the
pastor is one of the ten who are not.** Anyone asking why a particular person
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
