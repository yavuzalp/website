# AlgoArena

Real-time multiplayer coding-duel MVP for yavuzalp.com, living at
`algoarena.yavuzalp.com`. Static frontend (vanilla JS + Firebase SDK) —
no build step, no bundler, same "just files" philosophy as `dist/`.

Reuses the **existing** Firebase project (`yavuzalpturkoglu`) that already
powers interview-prep's sign-in/progress sync: same users, same billing, no
new Firebase project. Real-time room state, presence, and live progress use
Firestore's `onSnapshot` listeners — there is intentionally no separate
WebSocket server for that part.

The one piece that *isn't* static-plus-Firestore is code execution, which
needs a real sandbox: see `../piston-service/README.md`.

## Why a separate deployment target instead of `dist/`

`dist/` deploys to GitHub Pages under the `www.yavuzalp.com` custom domain —
GitHub Pages only supports **one** custom domain per Pages site (one `CNAME`
file). A second subdomain living on the same Pages deployment isn't
supported cleanly. Firebase Hosting was chosen instead of a second GitHub
Pages repo/site because it's the same project already in use here (no new
vendor), supports multiple "sites" with independent custom domains for free,
and serves static files with a global CDN + free TLS — a good fit since the
realtime requirement is fully satisfied by Firestore, not by needing a
Node server for the frontend itself.

## One-time setup (you'll need to run these — I don't have your Firebase/Railway login)

1. **Install the Firebase CLI** and log in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
2. **Create a second Hosting site** in the existing project (site IDs are
   globally unique across all Firebase projects — if `algoarena-yavuzalp` is
   taken, pick another and update `.firebaserc` to match):
   ```bash
   firebase hosting:sites:create algoarena-yavuzalp --project yavuzalpturkoglu
   firebase target:apply hosting algoarena algoarena-yavuzalp --project yavuzalpturkoglu
   ```
3. **Seed the 10 problems** into Firestore (public fields only — hidden test
   cases stay in `piston-service/problems-private.json`, never touch
   Firestore):
   ```bash
   # Firebase console -> Project settings -> Service accounts -> Generate new
   # private key -> save as scripts/serviceAccountKey.json (gitignored)
   node scripts/seed-arena-problems.mjs
   ```
4. **Deploy the Firestore rules** (adds the `arenaProblems`/`arenaRooms`
   rules alongside the existing `users/{uid}` rule — review `firestore.rules`
   first; see the "Firestore rules — what's verified" note below):
   ```bash
   firebase deploy --only firestore:rules --project yavuzalpturkoglu
   ```
5. **Deploy piston-service to Railway** — see `../piston-service/README.md`.
   Once you have its public URL, put it in `algoarena/piston-config.js`
   (`window.ALGOARENA_API_URL`).
6. **Deploy the AlgoArena frontend**:
   ```bash
   firebase deploy --only hosting:algoarena --project yavuzalpturkoglu
   ```
7. **DNS** (do this in your domain registrar, wherever `yavuzalp.com` is
   managed — I can't access that from here): Firebase Hosting will show you
   the exact records to add after step 2/6 (Hosting -> your site -> "Add
   custom domain" -> `algoarena.yavuzalp.com`). It'll ask for a `TXT` record
   to verify ownership, then a couple of `A` records (or a `CNAME` — Firebase
   tells you which once it sees the subdomain). This is separate from the
   existing `CNAME` file that points `www.yavuzalp.com` at GitHub Pages —
   you're adding a new subdomain record, not touching the existing one.

## Firestore rules — what's verified

`firestore.rules` has a matching test suite at
`scripts/test-firestore-rules.mjs` (using `@firebase/rules-unit-testing`)
that exercises every hard requirement from the spec: only the host can start
a match, only a player can write their own progress/code, **other players
cannot read a player's submitted code while the room is `active`**, and
**everyone can read it once the room is `finished`** (the reveal-at-the-end
requirement). I could not execute this test suite in the environment this
was built in — the Firestore emulator requires Java 21+, and only Java 8 was
available there, with no Docker either. Run it yourself before deploying the
rules for real:
```bash
cd scripts && npm install @firebase/rules-unit-testing firebase firebase-tools --no-save
npx firebase-tools emulators:exec --project algoarena-rules-test "node test-firestore-rules.mjs"
```
(needs a JDK 21+ on your machine; the emulator needs it, not this repo)

## Known MVP limitations (by design, not oversight)

- **Hidden test cases aren't cryptographically secret** — they're withheld
  from the UI and from Firestore (they only ever exist server-side in
  `piston-service`), same trust model as a normal online judge. A
  sufficiently determined player could still infer them by trial and error;
  this isn't a proctored-exam-grade anti-cheat system, and wasn't asked to
  be one.
- No mid-match reconnect/resume handling beyond what Firestore's own
  offline persistence gives for free — if a tab is closed mid-race, that
  player's progress simply stops advancing (their teammates still finish
  normally, the time cap still applies).
- No room cleanup job — finished/abandoned room documents are never
  deleted. Fine at MVP scale; worth a scheduled Cloud Function later if
  Firestore storage becomes a concern.
- Draft code isn't persisted between questions or across a page refresh
  mid-question (only the starter code reloads) — only *submitted* code
  (on a passing Submit) is saved, which is what the results reveal needs.
