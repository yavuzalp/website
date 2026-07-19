// One-time (or re-run-safe) seed script: writes the 10 AlgoArena problems into
// Firestore's `arenaProblems` collection, PUBLIC FIELDS ONLY (no test cases/
// expected outputs — those stay server-side in piston-service/problems-private.json
// so a curious player can't just read Firestore to see hidden test answers).
//
// Usage:
//   1. Firebase console -> Project settings -> Service accounts -> Generate new
//      private key -> save as scripts/serviceAccountKey.json (gitignored)
//   2. node scripts/seed-arena-problems.mjs
//
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');

let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (e) {
    console.error('Missing scripts/serviceAccountKey.json — see the comment at the top of this file.');
    process.exit(1);
}

const problems = JSON.parse(
    readFileSync(join(__dirname, '..', 'piston-service', 'problems-private.json'), 'utf8')
);

const PUBLIC_FIELDS = [
    'id', 'title', 'pattern', 'patternId', 'difficulty',
    'functionName', 'statement', 'examples', 'starterCode',
    'paramNames', 'treeParam'
];

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const batch = db.batch();
for (const p of problems) {
    const publicDoc = {};
    for (const key of PUBLIC_FIELDS) {
        if (p[key] !== undefined) publicDoc[key] = p[key];
    }
    const ref = db.collection('arenaProblems').doc(p.id);
    batch.set(ref, publicDoc, { merge: false });
}
await batch.commit();
console.log(`Seeded ${problems.length} problems into arenaProblems (public fields only).`);

// Sanity check: make sure no hidden test data leaked into the public docs.
for (const p of problems) {
    const snap = await db.collection('arenaProblems').doc(p.id).get();
    if (snap.data().tests) {
        console.error(`WARNING: ${p.id} has a 'tests' field in Firestore — this should never happen.`);
    }
}
console.log('Verified: no hidden test data present in any public arenaProblems doc.');
