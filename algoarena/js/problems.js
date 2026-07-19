import { db, collection, getDocs } from './firebase-init.js';

let cache = null;

export async function loadAllProblems() {
    if (cache) return cache;
    const snap = await getDocs(collection(db, 'arenaProblems'));
    cache = snap.docs.map(function (d) { return d.data(); });
    return cache;
}

export async function getProblem(id) {
    const all = await loadAllProblems();
    return all.find(function (p) { return p.id === id; }) || null;
}

// Deterministic-ish pick: filters by pattern ("Mixed" = any) and difficulty
// ("Mixed" = any), then shuffles with a simple seeded RNG so all players in a
// room see the exact same order (room code is the seed).
export async function pickProblemSet(count, patternId, difficulty, seed) {
    const all = await loadAllProblems();
    let pool = all.filter(function (p) {
        const patternOk = !patternId || patternId === 'mixed' || p.patternId === patternId;
        const diffOk = !difficulty || difficulty === 'Mixed' || p.difficulty === difficulty;
        return patternOk && diffOk;
    });
    if (pool.length === 0) pool = all.slice();

    const rng = seededRandom(seed);
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = [];
    for (let i = 0; i < count; i++) {
        picked.push(shuffled[i % shuffled.length].id);
    }
    return picked;
}

function seededRandom(seedStr) {
    let h = 1779033703 ^ String(seedStr).length;
    for (let i = 0; i < String(seedStr).length; i++) {
        h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822519);
        h = Math.imul(h ^ (h >>> 13), 3266489917);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}
