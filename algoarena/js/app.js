import { auth, doc, getDoc, setDoc, db, serverTimestamp } from './firebase-init.js';
import { onUserChange, requireSignIn } from './auth-ui.js';
import { loadAllProblems, getProblem } from './problems.js';
import {
    createRoom, joinRoom, startMatch, watchRoom, watchPlayers, tryFinishMatch,
    TIME_CAP_MINUTES, MIN_PLAYERS
} from './room.js';
import { runSubmission, isConfigured } from './piston-client.js';

// ---------------------------------------------------------------- state ----
let user = null;
let roomCode = null;
let unsubRoom = null;
let unsubPlayers = null;
let latestRoom = null;
let latestPlayers = [];
let cm = null; // CodeMirror instance
let currentProblem = null;
let questionStartedAt = null;
let raceInterval = null;
let submitting = false;

const views = ['lobby', 'waiting', 'race', 'results'];
function showView(name) {
    views.forEach(function (v) {
        document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    });
}

// ------------------------------------------------------------ lobby UI ----
document.querySelectorAll('[data-lobby-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        document.querySelectorAll('[data-lobby-tab]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('lobby-create').classList.toggle('hidden', btn.dataset.lobbyTab !== 'create');
        document.getElementById('lobby-join').classList.toggle('hidden', btn.dataset.lobbyTab !== 'join');
    });
});

document.getElementById('createRoomForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireSignIn()) return;
    const errEl = document.getElementById('createRoomError');
    errEl.hidden = true;
    try {
        const patternSelect = document.getElementById('patternSelect');
        const code = await createRoom(user, {
            numQuestions: parseInt(document.getElementById('numQuestions').value, 10),
            patternId: patternSelect.value,
            patternLabel: patternSelect.options[patternSelect.selectedIndex].text,
            difficulty: document.getElementById('difficultySelect').value
        });
        enterRoom(code);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
    }
});

document.getElementById('joinRoomForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireSignIn()) return;
    const errEl = document.getElementById('joinRoomError');
    errEl.hidden = true;
    try {
        const code = await joinRoom(document.getElementById('joinCode').value, user);
        enterRoom(code);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
    }
});

document.getElementById('backToLobbyBtn').addEventListener('click', function () {
    leaveRoomTracking();
    history.pushState({}, '', '/');
    showView('lobby');
});

// -------------------------------------------------------------- routing ----
function enterRoom(code) {
    roomCode = code;
    history.pushState({}, '', '/?room=' + code);
    trackRoom(code);
}

function trackRoom(code) {
    leaveRoomTracking();
    unsubRoom = watchRoom(code, onRoomUpdate);
    unsubPlayers = watchPlayers(code, onPlayersUpdate);
}

function leaveRoomTracking() {
    if (unsubRoom) unsubRoom();
    if (unsubPlayers) unsubPlayers();
    if (raceInterval) clearInterval(raceInterval);
    unsubRoom = unsubPlayers = raceInterval = null;
}

function onRoomUpdate(room) {
    latestRoom = room;
    if (!room) { showView('lobby'); return; }
    if (room.status === 'waiting') renderWaiting(room);
    else if (room.status === 'active') renderRace(room);
    else if (room.status === 'finished') renderResults(room);
}

function onPlayersUpdate(players) {
    latestPlayers = players;
    if (!latestRoom) return;
    if (latestRoom.status === 'waiting') renderWaitingPlayers(players);
    else if (latestRoom.status === 'active') {
        // renderRace() re-checks MY OWN currentQuestionIndex and loads the
        // next problem when it's changed (it no-ops back to just a player-
        // strip refresh when nothing relevant changed, via the
        // currentProblem.id guard inside it) — the room document itself
        // never changes when a player advances, only their own player doc
        // does, so this listener is the only thing that can ever notice a
        // successful Submit and move the race screen to the next question.
        renderRace(latestRoom);
        checkMatchEnd(players);
    }
    else if (latestRoom.status === 'finished') renderResults(latestRoom);
}

// ------------------------------------------------------------- waiting ----
function renderWaiting(room) {
    showView('waiting');
    document.getElementById('waitingRoomCode').textContent = roomCode;
    document.getElementById('waitingSettings').textContent =
        room.numQuestions + ' questions · ' + (room.patternLabel || 'Mixed') + ' · ' + room.difficulty;
    const startBtn = document.getElementById('startMatchBtn');
    startBtn.classList.toggle('hidden', !user || room.hostUid !== user.uid);
    startBtn.onclick = async function () {
        startBtn.disabled = true;
        try { await startMatch(roomCode, user); }
        catch (err) {
            document.getElementById('waitingError').textContent = err.message;
            document.getElementById('waitingError').hidden = false;
            startBtn.disabled = false;
        }
    };
    renderWaitingPlayers(latestPlayers);
}

function renderWaitingPlayers(players) {
    const list = document.getElementById('waitingPlayersList');
    list.innerHTML = '';
    players.forEach(function (p) {
        const el = document.createElement('div');
        el.className = 'player-chip';
        el.innerHTML = '<span class="avatar">' + escapeHtml(p.avatarLetter || '?') + '</span><span>' +
            escapeHtml(p.displayName) + (p.uid === latestRoom.hostUid ? ' <span style="color:var(--text-dim);font-size:.75rem;">(host)</span>' : '') + '</span>';
        list.appendChild(el);
    });
    const startBtn = document.getElementById('startMatchBtn');
    if (startBtn && !startBtn.classList.contains('hidden')) {
        startBtn.disabled = players.length < MIN_PLAYERS;
        startBtn.textContent = players.length < MIN_PLAYERS
            ? 'Waiting for at least ' + MIN_PLAYERS + ' players…'
            : 'Start Match (' + players.length + ' players)';
    }
}

// --------------------------------------------------------------- race -----
async function renderRace(room) {
    showView('race');
    const me = latestPlayers.find(function (p) { return p.uid === user.uid; });
    if (!me) return; // player doc listener hasn't caught up yet
    const qIndex = me.currentQuestionIndex || 0;

    if (qIndex >= room.problemIds.length) {
        // I'm done with all my questions but match hasn't been marked finished yet
        renderWaitingForOthers(room, me);
        return;
    }

    const problemId = room.problemIds[qIndex];
    if (!currentProblem || currentProblem.id !== problemId) {
        currentProblem = await getProblem(problemId);
        questionStartedAt = Date.now();
        renderProblemPanel(currentProblem, qIndex, room.problemIds.length);
        setupEditor(currentProblem);
        document.getElementById('raceTestResults').innerHTML = '';
    }

    renderPlayerStrip(latestPlayers);
    startRaceTimer(room);
}

function renderWaitingForOthers(room, me) {
    document.getElementById('raceProblemPanel').innerHTML =
        '<h2>All done! 🎉</h2><p>Waiting for the other players to finish (or the ' + TIME_CAP_MINUTES + '-minute clock to run out)…</p>';
    document.getElementById('raceQuestionLabel').textContent = 'Finished';
    document.getElementById('runBtn').disabled = true;
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('raceTestResults').innerHTML = '';
    renderPlayerStrip(latestPlayers);
    startRaceTimer(room);
}

function renderProblemPanel(problem, qIndex, total) {
    document.getElementById('raceQuestionLabel').textContent = 'Question ' + (qIndex + 1) + ' / ' + total;
    const examplesHtml = (problem.examples || []).map(function (ex) {
        return '<div class="example-block"><code>' + escapeHtml(ex.input) + '</code><br>→ <code>' +
            escapeHtml(ex.output) + '</code>' + (ex.explanation ? '<div style="margin-top:.3rem;color:var(--text-dim);">' + escapeHtml(ex.explanation) + '</div>' : '') + '</div>';
    }).join('');
    document.getElementById('raceProblemPanel').innerHTML =
        '<span class="difficulty-badge diff-' + problem.difficulty + '">' + problem.difficulty + '</span> ' +
        '<span class="form-hint">' + escapeHtml(problem.pattern) + '</span>' +
        '<h2 style="margin-top:.4rem;">' + escapeHtml(problem.title) + '</h2>' +
        '<div style="white-space:pre-wrap;font-size:.9rem;line-height:1.55;">' + escapeHtml(problem.statement) + '</div>' +
        examplesHtml;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('submitBtn').disabled = false;
}

function setupEditor(problem) {
    const textarea = document.getElementById('raceEditor');
    if (!cm) {
        cm = CodeMirror.fromTextArea(textarea, {
            mode: 'text/x-java', theme: 'dracula', lineNumbers: true,
            indentUnit: 4, tabSize: 4, indentWithTabs: false, matchBrackets: true
        });
    }
    cm.setValue(problem.starterCode || '');
}

function startRaceTimer(room) {
    if (raceInterval) clearInterval(raceInterval);
    const endsAt = room.endsAt;
    function tick() {
        const remainingMs = endsAt - Date.now();
        const el = document.getElementById('raceTimer');
        if (remainingMs <= 0) { el.textContent = "Time's up"; return; }
        const m = Math.floor(remainingMs / 60000);
        const s = Math.floor((remainingMs % 60000) / 1000);
        el.textContent = m + ':' + String(s).padStart(2, '0') + ' left';
    }
    tick();
    raceInterval = setInterval(function () {
        tick();
        checkMatchEnd(latestPlayers);
    }, 2000);
}

function renderPlayerStrip(players) {
    const strip = document.getElementById('racePlayersStrip');
    strip.innerHTML = '';
    const total = latestRoom ? latestRoom.problemIds.length : 0;
    players.forEach(function (p) {
        const isMe = user && p.uid === user.uid;
        const pct = total ? Math.min(100, ((p.currentQuestionIndex || 0) / total) * 100) : 0;
        const card = document.createElement('div');
        card.className = 'player-progress-card' + (isMe ? ' is-me' : '') + (p.finished ? ' is-finished' : '');
        card.innerHTML =
            '<span class="avatar">' + escapeHtml(p.avatarLetter || '?') + '</span>' +
            '<div style="flex:1;min-width:0;">' +
            '<div class="ppc-name">' + escapeHtml(p.displayName) + (isMe ? ' (you)' : '') + '</div>' +
            '<div class="ppc-meta">' + (p.finished ? 'Finished!' : 'Q' + ((p.currentQuestionIndex || 0) + 1) + '/' + total +
                ' · ' + (p.currentPassCount || 0) + '/' + (p.currentTotalTests || '?') + ' tests') + '</div>' +
            '<div class="ppc-bar"><div class="ppc-bar-fill" style="width:' + pct + '%;"></div></div>' +
            '</div>';
        strip.appendChild(card);
    });
}

async function checkMatchEnd(players) {
    if (!latestRoom || latestRoom.status !== 'active') return;
    const total = latestRoom.problemIds.length;
    const allFinished = players.length > 0 && players.every(function (p) { return p.finished || (p.currentQuestionIndex || 0) >= total; });
    const timeUp = Date.now() > latestRoom.endsAt;
    if (allFinished || timeUp) {
        await tryFinishMatch(roomCode);
    }
}

document.getElementById('runBtn').addEventListener('click', function () { grade(false); });
document.getElementById('submitBtn').addEventListener('click', function () { grade(true); });

async function grade(isSubmit) {
    if (submitting || !currentProblem) return;
    submitting = true;
    const runBtn = document.getElementById('runBtn');
    const submitBtn = document.getElementById('submitBtn');
    runBtn.disabled = submitBtn.disabled = true;
    const resultsEl = document.getElementById('raceTestResults');
    resultsEl.innerHTML = '<span class="spinner-inline"></span> Running…';

    try {
        const code = cm.getValue();
        const result = await runSubmission(currentProblem.id, code);
        if (result.executionError) {
            resultsEl.innerHTML = '<div class="error-text">Your code didn\'t run:</div><pre style="white-space:pre-wrap;font-size:.8rem;">' +
                escapeHtml(result.executionError) + '</pre>';
            return;
        }
        renderTestResults(result);

        const meRef = doc(db, 'arenaRooms', roomCode, 'players', user.uid);
        await setDoc(meRef, {
            currentPassCount: result.passCount,
            currentTotalTests: result.totalCount
        }, { merge: true });

        if (isSubmit && result.allPassed) {
            await advanceQuestion(code);
        }
    } catch (err) {
        resultsEl.innerHTML = '<div class="error-text">' + escapeHtml(err.message) + '</div>';
    } finally {
        submitting = false;
        runBtn.disabled = submitBtn.disabled = false;
    }
}

function renderTestResults(result) {
    const resultsEl = document.getElementById('raceTestResults');
    resultsEl.innerHTML = '<strong>' + result.passCount + ' / ' + result.totalCount + ' tests passed</strong>';
    result.results.forEach(function (r, i) {
        const row = document.createElement('div');
        row.className = 'test-row ' + (r.passed ? 'pass' : 'fail');
        let label = 'Test ' + (i + 1) + (r.hidden ? ' (hidden)' : '');
        if (!r.hidden && !r.passed && r.actual !== undefined) label += ' — got: ' + JSON.stringify(r.actual);
        if (r.error) label += ' — ' + r.error;
        row.innerHTML = '<span class="dot"></span><span>' + escapeHtml(label) + '</span>';
        resultsEl.appendChild(row);
    });
}

async function advanceQuestion(code) {
    const elapsedMs = Date.now() - questionStartedAt;
    const privateRef = doc(db, 'arenaRooms', roomCode, 'players', user.uid, 'private', currentProblem.id);
    await setDoc(privateRef, { code: code, submittedAt: serverTimestamp(), elapsedMs: elapsedMs });

    const me = latestPlayers.find(function (p) { return p.uid === user.uid; });
    const nextIndex = (me.currentQuestionIndex || 0) + 1;
    const total = latestRoom.problemIds.length;
    const meRef = doc(db, 'arenaRooms', roomCode, 'players', user.uid);
    await setDoc(meRef, {
        currentQuestionIndex: nextIndex,
        currentPassCount: 0,
        currentTotalTests: 0,
        finished: nextIndex >= total,
        finishedAt: nextIndex >= total ? serverTimestamp() : null
    }, { merge: true });

    currentProblem = null; // forces renderRace to load the next problem
}

// ------------------------------------------------------------- results ----
async function renderResults(room) {
    showView('results');
    if (raceInterval) clearInterval(raceInterval);

    const table = document.getElementById('resultsTable');
    let rows = '<tr><th>Player</th><th>Questions Solved</th><th>Status</th></tr>';
    latestPlayers.forEach(function (p) {
        rows += '<tr><td>' + escapeHtml(p.displayName) + '</td><td>' +
            (p.currentQuestionIndex || 0) + ' / ' + room.problemIds.length + '</td><td>' +
            (p.finished ? '✅ Finished' : '⏱️ Time expired') + '</td></tr>';
    });
    table.innerHTML = rows;

    const revealEl = document.getElementById('resultsReveal');
    revealEl.innerHTML = '<span class="spinner-inline"></span> Loading submissions…';
    const problems = await Promise.all(room.problemIds.map(getProblem));

    let html = '';
    for (let i = 0; i < problems.length; i++) {
        const problem = problems[i];
        html += '<h4 style="margin-top:1.25rem;">Q' + (i + 1) + '. ' + escapeHtml(problem.title) + '</h4><div class="reveal-grid">';
        for (const p of latestPlayers) {
            const subSnap = await getDoc(doc(db, 'arenaRooms', roomCode, 'players', p.uid, 'private', problem.id));
            const sub = subSnap.exists() ? subSnap.data() : null;
            html += '<div class="reveal-card"><div class="reveal-card-head"><span>' + escapeHtml(p.displayName) + '</span>' +
                (sub ? '<span style="color:var(--good);">' + Math.round((sub.elapsedMs || 0) / 1000) + 's</span>' : '<span style="color:var(--text-dim);">not solved</span>') +
                '</div><pre>' + escapeHtml(sub ? sub.code : '(no submission)') + '</pre></div>';
        }
        html += '</div>';
    }
    revealEl.innerHTML = html;
}

// ------------------------------------------------------------- utils ------
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ------------------------------------------------------------- bootstrap --
onUserChange(function (u) {
    user = u;
    if (roomCode) trackRoom(roomCode); // re-subscribe so player-scoped views recompute with the signed-in uid
});

loadAllProblems().catch(function (err) {
    console.error('Failed to load AlgoArena problems from Firestore:', err);
});

if (!isConfigured()) {
    console.warn('AlgoArena: code execution backend not configured yet (piston-config.js). Run/Submit will show an explanatory error until piston-service is deployed.');
}

(function bootFromUrl() {
    const params = new URLSearchParams(location.search);
    const code = params.get('room');
    if (code) {
        roomCode = code.toUpperCase();
        trackRoom(roomCode);
    } else {
        showView('lobby');
    }
})();
