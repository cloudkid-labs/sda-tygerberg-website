# Release process

Three steps. In order. The narrative version is README → Versioning.

## 1. Feature work → `dev`

Squash-merge PRs into `dev`. Re-cut the working branch from `origin/dev` after
every merge — the squash rewrites the commit, so carrying it forward conflicts
every time:

```sh
git checkout -B <branch> origin/dev
```

CI must be green — every **step** conclusion, not "job finished".

## 2. Promote `dev` → `main`

```sh
git checkout -B promote/vX.Y.Z origin/dev
npm run version:patch        # or :minor / :major — here, nowhere else
npm run version:check        # what version-guard.yml asserts
git push -u origin promote/vX.Y.Z
gh pr create --base main --head promote/vX.Y.Z
```

`version-guard.yml` fails a version that is already tagged, behind the latest
tag, or not semver. Skip the bump and production still deploys — it just doesn't
tag. That is for a re-run only.

## 3. Merge, then check the steps

Merging runs `deploy-production-cloudflare.yml`: build → Cloudflare deploy →
prod smoke → **tag + GitHub release**. The tag is cut last, so a failed deploy
leaves no tag.

```sh
gh run view <run-id> --json jobs --jq '.jobs[0].steps[]|"\(.name): \(.conclusion)"'
curl -s https://sdatygerberg.co.za/health
```

Prod smoke sends `SMOKE_TOKEN`; a 403 on every page means the zone's WAF skip
rule is gone, not that the site is down.

Fix forward with the next patch release. Never force-push a branch with an open
or just-merged PR.

## Rules that have bitten

- **Carry the released number back onto `dev` after each promote.** The bump
  lives on the promote branch, so `dev` keeps the previous number — and the next
  promote's `version:patch` then lands on an already-tagged version and fails the
  guard. Same for content: if a promote branch ever carried code `dev` had not
  seen, realign `dev` before promoting again.
- **Cut the promote branch from `dev`.** A `main`-based promote carries work
  `dev` has never seen; the next promote conflicts, or reverts it silently.
- **Bump the version in the promote PR.** A bump on a feature branch squashes
  into `dev` and the next promote finds the number already tagged.
- **Check step conclusions, not job status** — a failed step still reports
  "Complete job".
