# Changelog

[Semantic Versioning](https://semver.org/). What the numbers mean: README,
"Versioning and releases".

## [1.4.4] — 2026-08-25

- The homepage video embeds from `youtube.com` rather than
  `youtube-nocookie.com`, under test: the nocookie domain redirect-loops
  through Google's consent flow (C-60).
- CI runs the smoke checks against `wrangler dev` on every pull request
  (`worker` job), so a `run_worker_first` regression fails the PR rather than
  the release (C-60).

## [1.4.3] — 2026-08-25

- The homepage video iframe pins `referrerPolicy="strict-origin-when-cross-origin"`.
  Without a referrer YouTube refuses the embed with Error 153 (C-60).
- C-60 corrects the record: the embed is playable and the `google.com` frame
  comes from neither this site nor YouTube's player bundle.
- A WAF skip rule is no longer the plan for the blocked production smoke check;
  the zone does not use the WAF (C-21, C-60).

## [1.4.2] — 2026-08-24

- The post-deploy smoke check exits when every check passes; it used to fall off
  the end and hold the deploy open on undici's connection pool, which stalled
  three production releases (C-60).
- The production smoke step is advisory until Cloudflare stops answering the CI
  runner 403 (C-60).

## [1.4.1] — 2026-08-24

- `/api/live-status` and `/api/contact` answered with the 404 page in 1.4.0:
  `run_worker_first` as a list is the whole set of paths that reach the Worker,
  not an addition to the default (C-60).
- The homepage video does not play. Widening the CSP to admit the frames the
  player builds at runtime replaced a silent failure with a visible redirect
  loop, so `frame-src` is back to its previous value; the embed itself is the
  problem and is still open (C-60).
- Both deploys now smoke-test the origin they just published; production does it
  before tagging (`npm run smoke`). `--no-edge` skips the Worker and header
  checks on the Pages preview, which has neither.

## [1.4.0] — 2026-08-24

- Focus rings are navy on light grounds, cream on dark (C-40). The brand orange
  stays the handoff `#e8862c` everywhere by decision; it misses AA on the light
  grounds and C-59 says what that costs.
- Headshot masters no longer answer a direct URL — the transformer gets them,
  everyone else gets the 1400px copy (C-51). One headshot generator, not two
  (C-52); `TG-DH-Louws.jpg` was the one built by the wrong one.
- Security headers, a hash-based Content-Security-Policy, `immutable` on
  `/_astro/*`, and SRI on Leaflet.
- CI runs typecheck, tests and build on every pull request; 26 tests, none
  before.
- `cronWindow` parses `N/step` (C-15); the version guard fails on a shallow
  clone instead of reading it as a first release (C-45).
- The pre-hydration homepage no longer advertises a past blood drive (C-44).
- `aria-controls` points at an element that exists (C-43); the beliefs category
  bar clears the header at every width (C-42); the language toggle carries
  `aria-pressed` (C-41).
- The map is a page, not a public file, and reads the address from `site.ts`
  (C-47); `/map.html` still 307s, now to `/map/`. The JSON-LD address is
  derived, not retyped (C-49).
- Workflow actions moved to their current majors; the four workflows were on
  runners Node 20 had been deprecated on (C-58).

## [1.3.2] — 2026-08-23

- Lané Louw is Tiener Jeugleier, not Junior Jeugleier; no Junior Jeugleier
  office remains. The Jeug block is oldest-tier-first again.

## [1.3.1] — 2026-08-23

- The 11:00 service is "Erediens" everywhere; it was "Hoofdiens" in
  `SERVICE_TIMES` and "Goddelike Diens" in the FAQ prose. Social card
  regenerated.

## [1.3.0] — 2026-08-22

- `/youth` behind the week grid's Jeugaand card: the Friday evening, and the
  five Sabbath age groups from 0-3 to 13-18. No volunteer names (C-38).
- "Junior Jeug" is "Jeugaand".
- Roster: Kinderbediening returns to Lenie Virgin, Junior Jeugleier goes to Lané
  Louw, Lisa Branders leads the Juniors.
- README open item 3 (children's programme ages) closed.
- Version guard also runs on `edited` and `ready_for_review`; #70 reached
  `main` mergeable without it having run once.
- Headshot counts corrected: 14 of 22 render, not 11. The three Louws landed in
  1.2.1 and stayed on the "needs the board" list (C-29).

## [1.2.1] — 2026-08-11

- `/blood-bank` lists the drive dates and their 45-minute slots; the week grid
  gains a fifth card counting the sessions still bookable (C-36, C-37).
- Ellen G. White Geskrifte (`egwwritings.org`) in "Voed jou geloof daagliks".
- `/llms.txt` per [llmstxt.org](https://llmstxt.org/), restating the site's
  facts for agent readers (C-35).
- Strewers, Kinderbediening and Gesinsbediening render — the three Louw
  headshots landed and are now referenced (C-29). The couple photo was cropped
  to portrait first.
- Six open advisories cleared: `js-yaml`, `nanoid`, `postcss` and `undici`,
  the last via `wrangler` 4.120.0 and a matching `@cloudflare/workers-types`.
- Token setup lists the R2 permission the consent bucket needs —
  SETUP-INSTRUCTIONS.md §3.2.

## [1.2.0] — 2026-08-10

- Consent records for `/api/contact` written to R2 before delivery (C-34).
  Retention is a manual lifecycle rule — SETUP-INSTRUCTIONS.md §3.6.
- Carousel swipe survives the browser cancelling an ambiguous gesture (C-33).
- Roster corrections for seven departments.
- Semver policy, promotion guard, this changelog.

## [1.1.0] — 2026-08-09

Re-tag of `a66c8ac` to move onto 1.x. No code change, and no 1.0.0.
`package.json` still read `0.3.0` at this tag; 1.2.0 brings them back into step.

## [0.3.0] — 2026-08-08

- "Kyk Lewendig" shows only while streaming, and deep-links to the broadcast.
- `/api/live-status` gained `videoId` and `watchUrl`.
- `WebSite` JSON-LD node, so search shows the church's name.

## [0.2.0] — 2026-08-04

- Footer pinned on short pages; Skenk links straight to `/giving`.
- Elder roles corrected against the board's list rather than the Ampsdraers PDF.

## [0.1.0] — 2026-08-01

First release.

[1.3.2]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.3.1...dev
[1.3.1]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v1.2.0
[1.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v1.1.0
[0.3.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.3.0
[0.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.2.0
[0.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.1.0
