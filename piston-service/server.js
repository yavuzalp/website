const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { buildDriver, parseDriverOutput } = require('./driver');

const PORT = process.env.PORT || 3000;
const PISTON_URL = process.env.PISTON_URL || 'http://localhost:2000';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://algoarena.yavuzalp.com,http://localhost:5000,http://localhost:8080')
    .split(',').map(function (s) { return s.trim(); });
const MAX_CODE_CHARS = 20000;
const RATE_LIMIT_PER_MINUTE = 20;
const EXEC_TIMEOUT_MS = 8000;

const problems = JSON.parse(fs.readFileSync(path.join(__dirname, 'problems-private.json'), 'utf8'));
const problemsById = new Map(problems.map(function (p) { return [p.id, p]; }));

if (!admin.apps.length) {
    // On Railway: set GOOGLE_APPLICATION_CREDENTIALS_JSON to the service
    // account JSON (as a single-line env var). Falls back to Application
    // Default Credentials for local `firebase emulators` dev.
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (raw) {
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    } else {
        admin.initializeApp();
    }
}

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cors({ origin: ALLOWED_ORIGINS }));

app.get('/health', function (req, res) { res.json({ ok: true }); });

async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });
    try {
        req.uid = (await admin.auth().verifyIdToken(token)).uid;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid or expired sign-in token.' });
    }
}

const rateLimitBuckets = new Map(); // uid -> { count, resetAt }
function rateLimit(req, res, next) {
    const now = Date.now();
    let bucket = rateLimitBuckets.get(req.uid);
    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + 60000 };
        rateLimitBuckets.set(req.uid, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT_PER_MINUTE) {
        return res.status(429).json({ error: 'Too many submissions — please slow down.' });
    }
    next();
}

app.post('/execute', requireAuth, rateLimit, async function (req, res) {
    const { problemId, code } = req.body || {};
    if (typeof problemId !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'problemId and code (strings) are required.' });
    }
    if (code.length > MAX_CODE_CHARS) {
        return res.status(400).json({ error: 'Submission too long.' });
    }
    const problem = problemsById.get(problemId);
    if (!problem) return res.status(404).json({ error: 'Unknown problem.' });

    const driverSource = buildDriver(problem, code);

    let pistonRes;
    try {
        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, EXEC_TIMEOUT_MS);
        const r = await fetch(PISTON_URL.replace(/\/$/, '') + '/api/v2/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                language: 'java',
                version: '15.0.2',
                files: [{ name: 'Main.java', content: driverSource }],
                run_timeout: 5000,
                compile_timeout: 10000
            })
        });
        clearTimeout(timer);
        pistonRes = await r.json();
    } catch (e) {
        return res.status(502).json({ error: 'Execution engine unavailable — please try again shortly.' });
    }

    if (pistonRes.compile && pistonRes.compile.code !== 0) {
        // javac failed — surface the compiler error so the player can fix their code.
        return res.json({
            results: [],
            passCount: 0,
            totalCount: problem.tests.length,
            allPassed: false,
            executionError: (pistonRes.compile.stderr || pistonRes.compile.output || 'Compilation failed.').slice(0, 2000)
        });
    }

    if (!pistonRes.run) {
        return res.status(502).json({ error: 'Execution engine returned an unexpected response.' });
    }

    const parsed = parseDriverOutput(pistonRes.run.stdout);
    if (!parsed) {
        // No results marker: the process crashed before grading ran (e.g. a
        // thrown error in static initialization). Surface stderr so the
        // player can fix their own code.
        return res.json({
            results: [],
            passCount: 0,
            totalCount: problem.tests.length,
            allPassed: false,
            executionError: (pistonRes.run.stderr || 'Unknown error').slice(0, 2000)
        });
    }

    res.json(parsed);
});

app.listen(PORT, function () {
    console.log('AlgoArena piston-service listening on :' + PORT + ' (piston at ' + PISTON_URL + ')');
});

module.exports = app;
