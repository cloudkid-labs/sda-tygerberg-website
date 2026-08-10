# Conventions

## Changelog and release notes

Terse. One sentence per entry is fine; one sentence for a whole release is fine.

- State what changed. Skip the rationale, the trade-offs and the reassurance —
  the commit and the linked concern already carry those.
- No preamble, no framing, no "notably" or "importantly".
- Reference `C-nn` or a doc section instead of re-explaining it.
- If an entry needs a paragraph, it belongs in the commit message or CONCERNS.md,
  not here.

The commit body is where reasoning lives, and it should stay detailed. The
changelog is an index, not an essay.

## Branches

PRs merge to `dev` by squash, which rewrites the commit. Reset the working
branch onto `origin/dev` after each merge — carrying the pre-squash commit into
the next PR conflicts every time.

```sh
git checkout -B <branch> origin/dev
```
