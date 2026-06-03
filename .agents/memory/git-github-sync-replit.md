---
name: GitHub sync from Replit workspace
description: Why pushing the Replit workspace to GitHub can fail, and the bundle-handoff workaround.
---

# Syncing the Replit workspace with GitHub (AliAlahbabi/VoxExam)

## Remote naming
- There is **no `origin` remote**. The GitHub remote is named `subrepl-15xtazqh` → `https://github.com/AliAlahbabi/VoxExam` (HTTPS).
- There are many `subrepl-*` ssh remotes that all point at the workspace itself (`git+ssh://...worf.replit.dev:/home/runner/workspace`), plus a `gitsafe-backup`. Only `subrepl-15xtazqh` is GitHub.
- Translate any `origin/...` instruction to `subrepl-15xtazqh/...`.

## Push authentication failure
- **Read works, write fails.** Pull/fetch from GitHub succeeds, but **push fails `UNAUTHENTICATED`** in the Git pane and `Invalid username or token. Password authentication is not supported` from the shell — even when Replit Settings shows the GitHub connection as "Active".
- **Why:** the Replit↔GitHub connection token lacks valid push/write access (stale token, missing repo authorization on the Replit GitHub App, or branch protection on `main`). Shell git in the agent environment has **no credential helper and no usable token** (`GIT_ASKPASS` returns empty/invalid; connection API returns 401).
- **How to apply:** don't expect shell `git fetch/push` to GitHub to work. Use the Git pane, and if push is rejected, the fix is on the GitHub side (re-authorize connection with repo write access, or push via a PR branch if `main` is protected) — not anything local.

## Main-agent git restriction
- The bash tool **blocks destructive git** (`add`, `checkout`, `commit`, `merge` writes) for the main agent. Read-only git is fine with `git --no-optional-locks`. `git merge --abort` was allowed only because there was nothing to abort.
- **How to apply:** complete merges/commits through the **Git pane** (user action), not shell.

## Don't edit files mid-merge under the Git pane
- Overwriting a conflicted working-tree file via shell (e.g. `git show :3:file > file`) while the Git pane has a merge in progress **desyncs the pane** → "Unknown Error / INVALID_STATE". The index still shows the file `UU` regardless.
- **How to apply:** resolve conflicts through the pane's conflict resolver ("Accept Incoming/Current", "Mark as resolved"), not by editing files underneath it.

## Bundle handoff workaround (when push is blocked)
- To hand local commits to someone with working GitHub auth: `git bundle create file.bundle subrepl-15xtazqh/main..main` packages local-only commits as `refs/heads/main`. It's a **thin/range bundle** — it requires the merge-base commit to already exist in the destination clone (it does, since it's in GitHub history).
- `.bundle` can't be presented via present_asset; wrap in `.tar.gz` (no `zip` binary installed). Expert: `git fetch ../file.bundle main:replit-main`, merge into `main`, resolve, push.
