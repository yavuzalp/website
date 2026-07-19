# AlgoArena piston-service

A small Express proxy in front of a **self-hosted [Piston](https://github.com/engineer-man/piston)**
instance. It's the only piece of AlgoArena that isn't Firestore:

```
browser (algoarena.yavuzalp.com)
   │  POST /execute  { problemId, code }  +  Firebase ID token
   ▼
piston-service (this folder, Railway)
   │  verifies token, looks up the problem's HIDDEN test cases
   │  (never sent to the browser), builds one Python source file
   │  that runs the player's code + a grading harness
   ▼
piston (Railway, separate service, runs the actual sandboxed code)
```

Test cases (including hidden ones) live only in `problems-private.json` on
this server — the public Firestore `arenaProblems` docs deliberately omit
them (see `scripts/seed-arena-problems.mjs`), so a player can't read the
answers by inspecting Firestore traffic.

## Local dev (requires Docker)

```bash
cp .env.example .env   # fill in GOOGLE_APPLICATION_CREDENTIALS_JSON
docker compose up -d piston
docker compose run --rm piston-init      # installs the python 3.10 runtime once
docker compose up --build proxy
curl http://localhost:3000/health
```

## Deploying to Railway (two separate services, same Railway project)

This should be its **own** Railway project — do not add it to the existing
`halalLife` project. Pattern borrowed from `halalLife/Dockerfile.api` /
`docker-compose.yml` (multi-service, Dockerfile-per-service, env-driven).

1. **New Railway project** → "Deploy from GitHub repo" → pick this repo,
   root directory `piston-service/`.
2. **Service A — `piston`**: deploy the public image `ghcr.io/engineer-man/piston:latest`
   directly (Railway supports "Deploy an image" without a Dockerfile). It
   needs privileged/cgroup access for its isolate sandbox — confirm Railway's
   current plan supports that (this was **not verified** in this project's
   build environment, which had no Docker at all; test this first before
   relying on it). If Railway can't grant the sandbox the access it needs,
   the fallback is a small VM (e.g. a $5 DigitalOcean droplet) running
   `docker-compose.yml` as-is.
   - After it's up, install the Python runtime once:
     `curl -X POST https://<piston-service>.railway.internal:2000/api/v2/packages/python/3.10.0/install`
3. **Service B — `proxy`** (this Dockerfile): set env vars
   - `PISTON_URL` = the Railway-internal URL of service A (e.g. `http://piston.railway.internal:2000`)
   - `ALLOWED_ORIGINS` = `https://algoarena.yavuzalp.com`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` = the service account key JSON (one line)
4. Note the public URL Railway gives service B (e.g. `https://algoarena-proxy-production.up.railway.app`)
   and paste it into `algoarena/piston-config.js` as `window.ALGOARENA_API_URL`.

## What's verified vs. not

**Verified in this build environment** (no Docker was available, so this is
as far as automated testing could go — see `tests/driver.test.js`, run via
`npm test`):
- `driver.js`'s Python-source generation, for all 10 problems, executed
  against a real local Python 3.10 interpreter (not Piston, but the same
  interpreter version Piston will run) — correct solutions pass 100% of
  hidden + visible tests, wrong solutions fail correctly, exceptions are
  caught per-test instead of crashing, and hidden-test `actual` values are
  redacted from the API response so they can't leak the expected answer.
- A basic adversarial-input case (user code containing the result marker
  string, quotes, and newlines) doesn't corrupt the harness's own JSON
  parsing, because the embedded test data is a separate Python statement,
  not string-concatenated with the player's code.

**NOT verified — needs a real deploy to check:**
- The actual self-hosted Piston container running under Railway (or
  wherever it ends up) with the real sandbox/isolation active — resource
  limits, `run_timeout` enforcement, network access from inside the sandbox
  (should be none), and whether Railway's container platform even permits
  Piston's cgroup/isolate requirements.
- `server.js`'s HTTP layer end-to-end (Express routing, CORS, the
  `requireAuth` Firebase-token check, and the in-memory rate limiter) — unit
  logic wasn't separately tested; only `driver.js` was. Worth a quick manual
  pass (curl with/without a token, hammering `/execute` past the rate limit)
  once it's deployed.
- Whether Piston's default resource limits are generous enough for the
  `count-islands` / `combination-sum` problems' larger hidden test cases —
  should be fine (all inputs are small) but wasn't measured under Piston's
  actual CPU/memory caps.
