# yavuzalp.com — project context

This file exists so a new Claude Code session doesn't need everything
re-explained from scratch. Keep it factual: update it when something here
goes stale, rather than letting it drift.

## What this site is

Yavuzalp Turkoglu's personal site, plus a few small apps attached to it:

- **Home page** (`/`) — resume/portfolio (About, Experience, Projects).
- **Interview Prep** (`/interview-prep/`) — a large single-page DSA
  reference: 18 patterns, 45 code templates each with Python/Java/C# tabs,
  a solved-problem checklist, and account sign-in so progress syncs across
  devices.
- **Halal Scanner** (`/halal-scanner/`) — embeds (via iframe) a separate
  product, `github.com/yavuzalp/halalLife`, deployed independently on
  Railway. This repo does not contain that app's code.
- **Admin dashboard** (`/admin/`) — unlisted (not linked from nav,
  `noindex`), gated client-side to the owner's email
  (`turkoglu.yavuzalp@gmail.com`). Shows aggregate interview-prep solve
  stats pulled from Firestore, and a link to Google Analytics.
- **AlgoArena** (`algoarena.yavuzalp.com`) — real-time multiplayer coding
  duels (Java only). **Lives in this same repo** (`algoarena/`,
  `piston-service/`) but is a structurally separate subsystem: different
  deploy target, different hosting provider, currently unmerged into
  `master`. See the dedicated section near the bottom before touching it.

## Tech stack

- Plain static HTML/CSS/JS. **No build step for the deployed site** — the
  files in `dist/` are what actually ships, hand-edited directly.
- Originally scaffolded from the `startbootstrap-resume` template
  (Bootstrap 4.5.3 + jQuery + a Pug/SCSS source pipeline under `src/`,
  buildable via `npm run build`). **That pipeline is not used in practice**
  — nobody has run it in this project's real history; every change so far
  has edited `dist/*.html` and `dist/css/*.css` by hand. Don't assume
  editing `src/` and rebuilding will reflect anywhere — it won't unless
  someone actually starts using that pipeline again.
- `dist/css/styles.css` — the compiled Bootstrap + vendor theme CSS.
  Treat as vendor output; make styling changes in `futuristic.css` instead
  where possible.
- `dist/css/futuristic.css` — the actual design layer for this project,
  loaded after `styles.css` so it can override it. This is where nearly
  all real styling work happens. See "CSS conventions" below.
- Firebase (Auth + Firestore) for interview-prep sign-in/progress sync and
  the admin dashboard's data. Same project also backs AlgoArena.
- Google Analytics (GA4, `G-JLZPGN2LXD`) on the three main pages (home,
  halal-scanner, interview-prep) — not on `/admin/`.

## Repo structure

```
dist/                   ← deployed site source (edit these files directly)
  index.html            ← home page, stays at the root ("/")
  halal-scanner/index.html
  interview-prep/index.html
  admin/index.html
  halal-scanner.html     ← redirect stub → /halal-scanner/ (old URL, kept for compat)
  interview-prep.html    ← redirect stub → /interview-prep/
  css/{styles.css, futuristic.css}
  js/{scripts.js, theme.js, auth.js, admin.js}
  firebase-config.js     ← window.FIREBASE_CONFIG (public values, see below)
  assets/img/            ← favicon, images
src/, scripts/, package.json  ← vendor Pug/SCSS build pipeline, unused (see above)
docs/CNAME              ← leftover from an old GitHub Pages config; unused, harmless
algoarena/               ← AlgoArena frontend (separate deploy target — see below)
piston-service/          ← AlgoArena's code-execution backend (separate deploy — see below)
CNAME                    ← www.yavuzalp.com (GitHub Pages custom domain, master branch only)
```

`dist/js/scripts 2.js` is a stray unused duplicate (not referenced by any
HTML) — dead file, safe to delete whenever someone notices it, not
currently doing anything.

## Deploy process — read this before pushing anything

**GitHub Pages serves the `gh-pages` branch, not `master`.** There is no
CI/CD and no auto-deploy from `master`. Every deploy is a manual copy:

```bash
# 1. Do the work on master (or a feature branch merged into master) inside dist/,
#    commit and push master as normal.

# 2. Switch to gh-pages and sync with remote:
git checkout gh-pages
git pull origin gh-pages

# 3. Copy the changed files from master's dist/ into the gh-pages root
#    (gh-pages has NO dist/ prefix — dist/ is flattened to the branch root):
git show master:dist/index.html > index.html
git show master:dist/css/futuristic.css > css/futuristic.css
# ...repeat per changed/new file, e.g.:
git show master:dist/interview-prep/index.html > interview-prep/index.html
git show master:dist/firebase-config.js > firebase-config.js
git show master:dist/js/auth.js > js/auth.js

# 4. Commit and push:
git add <the files you copied>
git commit -m "Deploy: <what changed>"
git push origin gh-pages

# 5. Back to master:
git checkout master
```

Always `git status` on `gh-pages` after copying, before committing — it's
easy to miss a new file (a `git show` typo silently does nothing) or pull
in something extraneous. This project's history has a couple of "chore:
remove spurious dist/ files from gh-pages" cleanup commits from exactly
that mistake.

`gh-pages` has no `_config.yml` and no `.nojekyll` — it runs under
Jekyll's plain defaults. That's fine: plain HTML files without front
matter, and regular subdirectories, pass through unchanged, so
`folder/index.html` is served at `/folder/` the same as any static host.
Don't add a `_config.yml` without checking what default excludes it might
introduce.

## Clean URLs

`/halal-scanner/` and `/interview-prep/` are real directories
(`dist/halal-scanner/index.html`, `dist/interview-prep/index.html`), not
Jekyll magic. The old `dist/halal-scanner.html` / `dist/interview-prep.html`
paths still exist as tiny redirect stubs (meta-refresh + JS + plain link
fallback, `rel=canonical` to the new URL) so old bookmarks/indexed links
don't 404. `dist/index.html` stays at the root — it was already clean.

Because the two moved pages now live one directory deeper, **all their
internal asset/nav references are root-relative** (`/css/styles.css`,
`/js/auth.js`, `/halal-scanner/`, `/#about`, etc.), not relative
(`css/styles.css`). This is safe because the site is served at the domain
root (`www.yavuzalp.com`), not a subpath. If you add a new top-level page
as its own directory, follow the same root-relative pattern — don't use
page-relative paths, they'll break depending on nesting depth.

**Testing note:** root-relative paths do not resolve under `file://` — you
must serve `dist/` over real HTTP to test them (e.g. `npx serve dist` or
similar). Opening the HTML file directly in a browser will show broken
CSS/JS and you'll waste time debugging something that isn't actually broken.

## Firebase project

Project id: `yavuzalpturkoglu` (console: Firebase console → that project).
One project serves multiple things:

- **Interview-prep sign-in + progress sync** — email/password and Google
  auth; `users/{uid}` Firestore doc holds `{ solved: { <problemId>: true,
  ... }, updatedAt }`. Client config lives in `dist/firebase-config.js` as
  a plain global (`window.FIREBASE_CONFIG = {...}`), loaded as a classic
  `<script>` before the ES-module scripts that use it (`js/auth.js`,
  `js/admin.js`). These values (`apiKey`, `authDomain`, etc.) are **not
  secret** — Firebase's client config is meant to be public; the real
  access boundary is Firestore Security Rules, not hiding this file.
- **Admin dashboard** — reads across all `users/*` docs to aggregate solve
  stats (`js/admin.js`), gated purely client-side on
  `auth.currentUser.email === 'turkoglu.yavuzalp@gmail.com'`. That's an
  explicit, accepted trade-off for a static site with no backend — nothing
  sensitive should ever be placed directly in that page's HTML/JS; a
  determined visitor can always view source. Real protection for anything
  sensitive has to come from Firestore rules, not this check.
- **AlgoArena** — same project, additional collections (`arenaProblems`,
  `arenaRooms/{roomCode}/players/{uid}`, etc.) — see below.

**Known gap:** the `users/{uid}` Firestore security rule (owner-only
read/write) was set up by hand in the Firebase console when interview-prep
sign-in shipped — it is **not version-controlled anywhere on `master`**.
The only committed `firestore.rules` file lives on the (unmerged)
`feature/algoarena` branch, and it does include the same `users/{uid}`
rule alongside the new arena ones. If you ever need to confirm or restore
the interview-prep rule from source, that branch's `firestore.rules` is
the closest thing to a canonical copy — but the actual deployed rule
should always be checked live in the console, not assumed from a branch
that hasn't merged.

`firebase.json` / `.firebaserc` (also only on `feature/algoarena` right
now) configure a *second* Firebase Hosting target for AlgoArena — unrelated
to `master`'s GitHub Pages deploy.

## AlgoArena — separate subsystem, read before touching

Everything below lives on the **`feature/algoarena` branch**, not merged
into `master` as of this writing, even though (per its commit history —
`f65b405 feat: wire the real piston-service proxy URL — code execution is
live`, `e0d23c5 fix: point algoarena hosting target at the actual live
site`) it appears to have actually been deployed and made live
independently of that merge. Deploys to Firebase Hosting / the code-exec
backend are triggered manually from whatever's checked out locally — they
are **not** gated by anything landing on `master`. Don't assume "not on
master" means "not live," and don't assume "live" means "safe to treat
`feature/algoarena` as merged" — check both independently.

- **Why a separate deploy target**: GitHub Pages only supports one custom
  domain per Pages site (one `CNAME` file, already used for
  `www.yavuzalp.com`). AlgoArena is instead a second Firebase Hosting
  "site" (target name `algoarena`) in the same `yavuzalpturkoglu` project,
  mapped to the `algoarena.yavuzalp.com` subdomain via a separate DNS
  entry — the existing root `CNAME` file is untouched.
- **Realtime is Firestore-only** — room state/presence/progress use
  `onSnapshot` listeners; there is no separate WebSocket server for that
  part.
- **Code execution is the one non-static piece**: `piston-service/` is a
  small Express proxy in front of a self-hosted **Piston**
  (`engineer-man/piston`) sandbox. Per `algoarena/piston-config.js`, the
  actual current deployment is **a DigitalOcean droplet running Piston +
  the proxy, fronted by Caddy for HTTPS**, reachable at
  `piston-api.yavuzalp.com`. `piston-service/README.md` still describes an
  earlier Railway-based deployment plan — that document is stale relative
  to what's actually running; trust `piston-config.js` and the commit
  history (`c1b0884 fix: bind proxy port to loopback too, ahead of
  fronting it with Caddy`) over the README for *where* it's deployed. The
  README is still accurate for the proxy's internal design (hidden test
  cases never reach the browser or Firestore, generated Java source per
  submission, etc.).
- **No Caddyfile is checked into this repo** — the reverse-proxy config
  for `piston-api.yavuzalp.com` lives only on the droplet itself.
- Full setup/deploy steps, known MVP limitations, and what has/hasn't been
  verified are documented in `algoarena/README.md` and
  `piston-service/README.md` — read those before making changes there
  rather than duplicating that detail here, since they're the ones likely
  to be kept current for that subsystem.
- `scripts/serviceAccountKey.json` (Firebase Admin SDK key, used by
  `scripts/seed-arena-problems.mjs` and the rules test suite) is
  git-ignored and must **never** be committed. Same for `piston-service/.env`.

## CSS conventions (futuristic.css)

- Design tokens are CSS custom properties on `:root`, redefined inside a
  `[data-theme="dark"]` block for dark mode: `--bg`, `--bg-surface`,
  `--accent` (+ `-dark`/`-dim`/`-glow` variants), `--text-1/2/3` (dark to
  light, all contrast-checked against their background), `--border`,
  `--shadow-sm/-md`, and semantic `--green/--yellow/--red/--cyan`. Use
  these rather than hardcoding colors — that's what makes dark mode work
  for free.
- **Light theme is the default**; dark is opt-in via a toggle button that
  sets `document.documentElement.dataset.theme` and persists the choice to
  `localStorage['theme-pref']` (`js/theme.js`). An inline anti-flash
  script in every page's `<head>` reads that preference (or
  `prefers-color-scheme` if unset) and sets the attribute *before* first
  paint, so there's no flash of the wrong theme.
- The interview-prep and halal-scanner/home nav bars share one `#sideNav`
  element but render completely differently depending on whether the page
  body has class `topnav`: with it, `#sideNav` becomes a horizontal fixed
  *top* bar (home, halal-scanner); without it, it's a fixed *left sidebar*
  column (interview-prep only — it has enough nav items, 18 topics, to
  need the vertical layout). If you're confused why a nav-related CSS
  change "isn't working," check which mode the page you're looking at is
  in first.
- `#sideNav` has been a repeated source of subtle regressions across this
  project's history — two separate incidents where a `position: relative`
  fix for a click-interception bug accidentally broke the sidebar's fixed
  positioning, and a flex-direction default meant to hold a single `<ul>`
  child rendered badly once a second child (theme toggle, then account
  indicator) was added below it. If you touch anything about `#sideNav`'s
  layout, verify it at real desktop width (root-relative CSS and the
  sidebar's fixed-column layout only kick in `≥992px` — check both above
  and below that breakpoint) and in both `topnav` and non-`topnav` modes.

## Testing notes

- No test framework for the main site — verify changes by actually loading
  the page (see the `file://` vs real-HTTP note above for root-relative
  paths).
- `piston-service` has a real test suite (`npm test`, see its README) and
  AlgoArena's Firestore rules have a matching one
  (`scripts/test-firestore-rules.mjs`) — both require tooling (a JDK for
  the rules emulator, Docker for the driver tests' full path) that may not
  be available in every environment; check their READMEs for what was and
  wasn't actually run before relying on "tests pass" for either.
