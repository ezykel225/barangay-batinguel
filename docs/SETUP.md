# Setting up on your own machine

For anyone joining the project. Takes about fifteen minutes, most of it
waiting for downloads.

## 1. Install

| What | Where | Why |
|---|---|---|
| **Node.js LTS** | [nodejs.org](https://nodejs.org) — the LTS button, not Current | Runs the project |
| **Git** | [git-scm.com](https://git-scm.com/download/win) — accept all defaults | Gets the code, sends your changes |
| **VS Code** | [code.visualstudio.com](https://code.visualstudio.com) | The editor |

Then two VS Code extensions (**Ctrl+Shift+X**, search, install):

- **ESLint** — shows the same warnings CI does, as you type
- **GitLens** — shows who changed each line and why

Don't install Prettier. This project has no Prettier config, so it would
reformat every file you touch and make your changes unreadable in review.

Check all three worked. Open a terminal and run:

```bash
node -v      # v20 / v22 / v24
npm -v
git --version
```

If Node shows the wrong version after installing, **close VS Code
entirely** and reopen — the terminal inherits its PATH from the VS Code
process, so a terminal opened before the install still sees the old one.

## 2. Get the code

Put it somewhere **outside OneDrive**. OneDrive will try to sync the
~300 MB of `node_modules` that step 3 creates, and your machine will
crawl.

```bash
cd C:\Users\<you>
mkdir projects
cd projects
git clone https://github.com/ezykel225/barangay-batinguel.git
cd barangay-batinguel
code .
```

VS Code will ask whether you trust the folder. Say yes — until you do,
extensions like ESLint stay switched off.

## 3. Create `.env`

**This is the step people skip, and skipping it produces a blank white
page with no error message.**

Make a file called exactly `.env` in the project root:

```
REACT_APP_SUPABASE_URL=https://mpcyqwasurhtdztzobwg.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<the publishable key>
```

Get the key from **Supabase → Project Settings → API → `anon` /
publishable key**, or ask a teammate.

`.env` is gitignored and must stay that way. Confirm with `git status` —
it should **not** appear.

The key itself is public by design; it already ships inside the site's
JavaScript. It still doesn't belong in a commit.

Do not add `DISABLE_ESLINT_PLUGIN=true`. It hides real warnings.

## 4. Install and run

```bash
npm install
npm start
```

`npm install` prints deprecation warnings and a vulnerability count.
Both are normal.

**Do not run `npm audit fix --force`**, even though npm suggests it.
Every one of those vulnerabilities is in the local development server,
not in anything deployed, and `--force` "fixes" them by installing
`react-scripts@0.0.0` — which destroys the build.

If `npm install` modifies `package-lock.json`, put it back with
`git restore package-lock.json` unless you deliberately changed a
dependency.

`npm start` opens [localhost:3000](http://localhost:3000) and reloads
when you save. That terminal is now busy — open a second one with the
**+** icon for git commands, and stop the server with **Ctrl+C**.

**Blank white page?** It's `.env`. Check it exists, check the spelling,
then stop and restart `npm start` — CRA only reads it at startup.

## 5. Making a change

**Never edit `main` directly.** Vercel deploys `main` automatically, so
a mistake there is a mistake on the live site.

```bash
git checkout main
git pull origin main          # start from what everyone else has

git checkout -b my-change     # your own branch
# ...edit, watch localhost:3000...

git add -A
git commit -m "What changed and why"
git push -u origin my-change
```

GitHub then offers a **Compare & pull request** button. Open the PR, let
someone read it, and merge it there.

A branch costs nothing and can be thrown away. If an experiment goes
wrong, `git checkout main` and it never happened. That's what makes it
safe to try things.

### The commands, in plain terms

| Command | What it does |
|---|---|
| `git status` | What have I changed but not committed? |
| `git pull origin main` | Bring down what's on GitHub |
| `git checkout -b name` | Start a branch |
| `git add -A` | Mark changes for the next commit |
| `git commit -m "..."` | Save a snapshot, with a note |
| `git push` | Send commits to GitHub |
| `git diff` | Show exactly what I changed |
| `git restore <file>` | Undo my changes to that file |

## 6. Before you open a pull request

```bash
npx eslint src --ext .js,.jsx
```

Should print nothing.

```bash
npx cross-env CI=true react-scripts build
```

`CI=true` turns warnings into errors, which is what the real build does.
If it passes here it won't fail after merging.

Check the page you changed at phone width too — open DevTools with
**F12** and use the device toolbar. The site is expected to work down to
320px with no sideways scrolling.

## Where to read next

`CLAUDE.md` in the project root explains how the system actually works —
the roles, the security model, and the decisions that look odd until you
know why. Read it before changing anything in `supabase-migrations/`.
