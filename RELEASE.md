# Release process

Four steps. In order. The narrative version is README → Versioning.

## 1. Feature work → `dev`

Squash-merge PRs into `dev`. Re-cut the working branch from `origin/dev` after
every merge — the squash rewrites the commit, so carrying it forward conflicts
every time:

```sh
git checkout -B <branch> origin/dev
```

CI must be green — every **step** conclusion, not "job finished".

## 2. Bump on `dev`

```sh
npm run version:patch        # or :minor / :major
npm run version:check        # what version-guard.yml asserts
```

A `Release vX.Y.Z` PR, squash-merged into `dev` like any other. The bump lives on
`dev` so that `main` can become `dev` exactly. A bump that exists only on a
promote branch is what leaves the two permanently disagreeing by a number, and
what makes the next `version:patch` collide with a tag.

`version-guard.yml` fails a version that is already tagged, behind the latest
tag, or not semver.

## 3. Promote `dev` → `main` — as a merge commit

```sh
gh pr create --base main --head dev --title "Promote to production: … — vX.Y.Z"
gh pr merge --merge          # NEVER --squash
```

`dev` already contains `main`'s history, so this lands as a **fast-forward**:
`main` becomes `dev`'s exact commit. Squash it and `dev`'s commits are rewritten
into a new one on `main`; the histories diverge, and every later compare page
reads "N behind, M ahead" of commits that exist on neither branch.

## 4. Check it

Merging deploys: build → Cloudflare deploy → prod smoke → **tag + GitHub
release**. The tag is cut last, so a failed deploy leaves no tag.

```sh
gh run view <run-id> --json jobs --jq '.jobs[0].steps[]|"\(.name): \(.conclusion)"'
curl -s https://sdatygerberg.co.za/health
git diff origin/dev origin/main --stat            # must be empty
git rev-list --count origin/dev..origin/main      # must be 0
```

Prod smoke sends `SMOKE_TOKEN`; a 403 on every page means the zone's WAF skip
rule is gone, not that the site is down.

Fix forward with the next patch release. Never force-push a branch with an open
or just-merged PR.

## Rules that have bitten

- **Parity both ways.** `git diff origin/dev origin/main` empty *and*
  `git rev-list --count origin/dev..origin/main` zero. If `main` ever carries a
  commit `dev` does not, back-merge `main` into `dev` before the next promote.
- **Never squash a promotion.** Squash is for feature PRs into `dev`. The
  promote is a merge commit precisely so the branches share history.
- **The version bump lives on `dev`**, not on a promote branch.
- **Check step conclusions, not job status** — a failed step still reports
  "Complete job".
