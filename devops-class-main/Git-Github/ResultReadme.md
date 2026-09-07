# Session 5 — Git & GitHub

**Name:** Palak Agrawal
**Enrollment Number:** 24BCS10504

## Overview

This session covered two Git operations:

1. `git commit -a -m` and how it differs from `git commit -m`
2. `git cherry-pick` — applying one specific commit from another branch

Both were practised in a test repository. The command output below is from
that practice run.

---

# Task 1 — `git commit -a -m` vs `git commit -m`

## The difference

| `git commit -m` | `git commit -a -m` |
|---|---|
| Commits only what is already staged | Automatically stages tracked files, then commits |
| Needs `git add` first | Skips `git add` for tracked files |
| Does not include untracked files | Also does **not** include untracked files |
| Explicit control over what goes in | Faster for quick edits to existing files |

The `-a` flag means "all **tracked** files". The word tracked is the whole
point — it does not mean "everything".

## Test 1 — modifying a tracked file, then `git commit -m`

A tracked file was modified without staging it:

```bash
echo "Line 2 added" >> README.md
git status --short
```

```text
 M README.md
```

Then `git commit -m` was tried:

```bash
git commit -m "Update README"
```

```text
On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   README.md

no changes added to commit
```

**Nothing was committed.** The change existed in the working directory but had
never been staged, and `git commit -m` only commits the staging area.

## Test 2 — staging first, then `git commit -m`

```bash
git add README.md
git commit -m "Update README with git add"
```

```text
[main bcf32cc] Update README with git add
 1 file changed, 1 insertion(+)
```

This time it worked. Two commands were needed: `add` then `commit`.

## Test 3 — `git commit -a -m` with no `git add`

```bash
echo "Line 3 added" >> README.md
git commit -a -m "Update README using -a flag"
```

```text
[main 67f04fe] Update README using -a flag
 1 file changed, 1 insertion(+)
```

Committed in **one** command, with no `git add`. This is what `-a` does — it
stages the modified tracked files for you before committing.

## Test 4 — `git commit -a -m` with an untracked file

This is the limit of `-a`. A brand new file was created:

```bash
echo "new file" > newfile.txt
git commit -a -m "Try to add newfile"
```

```text
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	newfile.txt

nothing added to commit but untracked files present (use "git add" to track)
```

**The new file was not committed.** `git status` confirms it is still
untracked:

```text
?? newfile.txt
```

## What I understood

`-a` is a shortcut for `git add` on files Git is *already* tracking. Git has
never seen `newfile.txt`, so it is not "modified" — it is untracked, and `-a`
ignores it completely.

This is a real trap: running `git commit -a -m` and assuming everything is
saved can silently leave new files out of the commit. Any new file needs
`git add` at least once.

```text
Untracked file  --git add-->  Tracked file  --modify-->  Modified
                                                              |
                                                    git commit -a -m
                                                              |
                                                          Committed
```

---

# Task 2 — Git Cherry-Pick

## Objective

Apply one specific commit from another branch into `main`, without merging the
whole branch.

## Step 1 — Create commits in main

```bash
echo "feature A" > a.txt && git add a.txt && git commit -m "Commit A: add a.txt"
echo "feature B" > b.txt && git add b.txt && git commit -m "Commit B: add b.txt"
echo "feature C" > c.txt && git add c.txt && git commit -m "Commit C: add c.txt"
```

## Step 2 — View the commits

```bash
git log --oneline
```

```text
4e3fc50 Commit C: add c.txt
5c1e06f Commit B: add b.txt
822c189 Commit A: add a.txt
67f04fe Update README using -a flag
bcf32cc Update README with git add
39e85a3 Initial commit
```

## Step 3 — Create a new branch

```bash
git checkout -b feature
```

```text
Switched to a new branch 'feature'
```

## Step 4 — Make commits on the new branch

```bash
echo "feature D" > d.txt && git add d.txt && git commit -m "Commit D: add d.txt"
echo "feature E" > e.txt && git add e.txt && git commit -m "Commit E: add e.txt - THIS ONE"
echo "feature F" > f.txt && git add f.txt && git commit -m "Commit F: add f.txt"
```

## Step 5 — Identify the commit to pick

```bash
git log --oneline
```

```text
7eff336 Commit F: add f.txt
31966c3 Commit E: add e.txt - THIS ONE
ffd8bd2 Commit D: add d.txt
4e3fc50 Commit C: add c.txt
5c1e06f Commit B: add b.txt
822c189 Commit A: add a.txt
```

Commit **E**, hash `31966c3`, is the one to bring into `main` — without D or F.

## Step 6 — Switch back to main and cherry-pick

```bash
git checkout main
ls *.txt
```

Files on `main` before the cherry-pick:

```text
a.txt
b.txt
c.txt
```

```bash
git cherry-pick 31966c3
```

```text
[main fcde726] Commit E: add e.txt - THIS ONE
 Date: Mon Sep 7 13:41:22 2026 +0530
 1 file changed, 1 insertion(+)
 create mode 100644 e.txt
```

## Step 7 — Verify

Files on `main` after:

```text
a.txt
b.txt
c.txt
e.txt
```

```bash
git log --oneline
```

```text
fcde726 Commit E: add e.txt - THIS ONE
4e3fc50 Commit C: add c.txt
5c1e06f Commit B: add b.txt
822c189 Commit A: add a.txt
```

```bash
cat e.txt
```

```text
feature E
```

`e.txt` is now on `main`, and `d.txt` and `f.txt` are not. Exactly one commit
crossed over.

## The branch graph

```bash
git log --oneline --graph --all
```

```text
* fcde726 Commit E: add e.txt - THIS ONE
| * 7eff336 Commit F: add f.txt
| * 31966c3 Commit E: add e.txt - THIS ONE
| * ffd8bd2 Commit D: add d.txt
|/
* 4e3fc50 Commit C: add c.txt
* 5c1e06f Commit B: add b.txt
* 822c189 Commit A: add a.txt
```

## What I understood

The graph shows the thing I did not expect: **"Commit E" appears twice, with
two different hashes** — `31966c3` on `feature` and `fcde726` on `main`.

Cherry-pick does not move or share a commit. It takes the *changes* that
commit introduced and applies them as a **brand new commit** on the current
branch. Same message, same content, different hash, different parent.

That is also why the two branches stay separate in the graph rather than
joining: nothing was merged. `main` gained the change from E while D and F
stayed behind on `feature`.

When it is useful: a bug fix committed on a feature branch that is not
finished yet. Merging would drag in all the unfinished work; cherry-picking
takes just the fix.

Worth knowing: if the picked commit touches lines that have since changed on
the target branch, the cherry-pick stops with a conflict that has to be
resolved by hand, the same as a merge conflict.

---

## Key Takeaways

- `git commit -m` commits only what is staged.
- `git commit -a -m` stages modified **tracked** files automatically, then
  commits.
- `-a` never picks up untracked files — new files always need `git add` first.
- `git cherry-pick <hash>` copies one commit's changes onto the current
  branch as a new commit with a new hash.
- `git log --oneline --graph --all` is the clearest way to see what actually
  happened across branches.

---

## Author

**Palak Agrawal**
**Enrollment Number: 24BCS10504**
