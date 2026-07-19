import {
    db, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs,
    serverTimestamp, auth
} from './firebase-init.js';
import { pickProblemSet } from './problems.js';

export const TIME_CAP_MINUTES = 25;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function randomCode(len) {
    let s = '';
    for (let i = 0; i < len; i++) {
        s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
}

export async function createRoom(user, settings) {
    // settings: { numQuestions, patternId, patternLabel, difficulty }
    for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode(5);
        const ref = doc(db, 'arenaRooms', code);
        const existing = await getDoc(ref);
        if (existing.exists()) continue;

        await setDoc(ref, {
            hostUid: user.uid,
            hostName: user.displayName || user.email || 'Host',
            status: 'waiting',
            numQuestions: settings.numQuestions,
            patternId: settings.patternId,
            patternLabel: settings.patternLabel,
            difficulty: settings.difficulty,
            maxPlayers: MAX_PLAYERS,
            timeCapMinutes: TIME_CAP_MINUTES,
            problemIds: [],
            createdAt: serverTimestamp()
        });
        await joinRoom(code, user);
        return code;
    }
    throw new Error('Could not generate a unique room code — please try again.');
}

export async function joinRoom(code, user) {
    code = (code || '').trim().toUpperCase();
    const roomRef = doc(db, 'arenaRooms', code);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) throw new Error('No room found with that code.');
    const room = roomSnap.data();
    if (room.status !== 'waiting') throw new Error('This match has already started or finished.');

    const playersSnap = await getDocs(collection(db, 'arenaRooms', code, 'players'));
    const alreadyIn = playersSnap.docs.some(function (d) { return d.id === user.uid; });
    if (!alreadyIn && playersSnap.size >= MAX_PLAYERS) {
        throw new Error('This room is full (max ' + MAX_PLAYERS + ' players).');
    }

    const playerRef = doc(db, 'arenaRooms', code, 'players', user.uid);
    await setDoc(playerRef, {
        displayName: user.displayName || (user.email || 'Player').split('@')[0],
        avatarLetter: (user.displayName || user.email || '?').charAt(0).toUpperCase(),
        joinedAt: serverTimestamp(),
        currentQuestionIndex: 0,
        currentPassCount: 0,
        currentTotalTests: 0,
        finished: false
    }, { merge: true });

    return code;
}

export async function startMatch(code, user) {
    const roomRef = doc(db, 'arenaRooms', code);
    const roomSnap = await getDoc(roomRef);
    const room = roomSnap.data();
    if (room.hostUid !== user.uid) throw new Error('Only the host can start the match.');

    const problemIds = await pickProblemSet(room.numQuestions, room.patternId, room.difficulty, code);
    const startedAt = Date.now();
    const endsAt = startedAt + TIME_CAP_MINUTES * 60 * 1000;

    await updateDoc(roomRef, {
        status: 'active',
        problemIds: problemIds,
        startedAt: serverTimestamp(),
        endsAt: endsAt
    });
}

export function watchRoom(code, cb) {
    return onSnapshot(doc(db, 'arenaRooms', code), function (snap) {
        cb(snap.exists() ? snap.data() : null);
    });
}

export function watchPlayers(code, cb) {
    return onSnapshot(collection(db, 'arenaRooms', code, 'players'), function (snap) {
        const players = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
        cb(players);
    });
}

// Any room member may flip an active match to 'finished' once the end
// condition is met (all players done, or the time cap has passed). Enforced
// server-side by firestore.rules — this call is a no-op (rejected) if someone
// else already made the transition or the room isn't in 'active' status.
export async function tryFinishMatch(code) {
    try {
        await updateDoc(doc(db, 'arenaRooms', code), {
            status: 'finished',
            finishedAt: serverTimestamp()
        });
        return true;
    } catch (e) {
        return false; // already finished, or we're not eligible — both fine to ignore
    }
}

export function currentUid() {
    return auth.currentUser ? auth.currentUser.uid : null;
}
