# Changelog

Notable changes per released version, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

What the numbers mean here is written down in the README under
"Versioning and releases" — in short, **MAJOR** is a breaking change to the
Worker's HTTP API or a removed public URL, **MINOR** is a new page or
capability, **PATCH** is content, copy and fixes.

Releases are cut by the production deploy, which tags the commit it shipped.
GitHub's generated notes list every commit; this file is the curated version —
what changed for the church and for anyone maintaining the site.

## [1.2.0] — unreleased

Staged on `dev`, not yet promoted to `main`. Dated when the promotion deploys
and the tag is cut. MINOR because consent storage is a new capability that adds
a `consentStored` field without changing any existing one.

### Added

- Consent records for `/api/contact` submissions, written to the
  `consent-cloudkid-link` R2 bucket before delivery is attempted, with the
  record id echoed into the enquiry email (C-34). Retention is a manual R2
  lifecycle rule — SETUP-INSTRUCTIONS.md §3.6.
- Semantic versioning policy, a `version:check` guard on promotion PRs, and
  this changelog.

### Fixed

- Carousel swipe on touch devices. The browser cancels an ambiguous gesture and
  the old code discarded it, which is why the deck felt dead on a phone while
  working on a desktop. Now axis-locked, claimed via a non-passive `touchmove`,
  and settled rather than thrown away on cancellation (C-33).

### Changed

- Department roster corrections for seven departments: Kinderbediening moved
  from Lenie Virgin to Lané Louw, Vrouebediening is now held by both Hanlie
  Tolmay and Linda Jennings, the family-ministry card names Morné and Lelani
  Louw, and the four Jeug tiers are ordered adjacently.

## [1.1.0] — 2026-08-09

No code change. Tagged against the same commit as v0.3.0 (`a66c8ac`) to move the
project onto `1.x` — the site had been live and serving a congregation for some
time, and `0.y.z` claims under semver that anything may change at any time.

There is no `1.0.0`. Note that `package.json` on `main` still reads `0.3.0` at
this tag; the next promotion carries `1.2.0` and brings the two back into step,
which is what the new version guard exists to keep true.

## [0.3.0] — 2026-08-08

### Fixed

- The hero's "Kyk Lewendig" button appeared every day of the week and linked to
  the channel rather than to anything watchable. It now renders only while the
  channel is streaming and deep-links to the broadcast, falling back to the
  channel's `/live` tab when the API answers without a video id.

### Changed

- `/api/live-status` returns `videoId` and `watchUrl` alongside `isLive`.
- Worker observability widened; a `WebSite` node added to the JSON-LD so search
  results carry the church's name rather than the operator's.

## [0.2.0] — 2026-08-04

### Fixed

- Footer pinned to the bottom on short pages; "Skenk" links straight to
  `/giving`.

### Changed

- Elder roles corrected against the board's list rather than the Ampsdraers
  PDF: Persoonlike Bediening and the Strategiesebeplannings-komitee belong to
  Laura Rolff, and Jaco van Niekerk is head elder only.
- Email setup verified and documented.

## [0.1.0] — 2026-08-01

First tagged release. The site as originally built: home, beliefs, connect,
bible studies and giving pages, the department-head carousel, the LIVE badge
backed by `/api/live-status`, and `/api/contact` delivering enquiries by
Cloudflare Email Sending with a webhook fallback.

[1.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.1.0...dev
[1.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v1.1.0
[0.3.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.3.0
[0.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.2.0
[0.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.1.0
