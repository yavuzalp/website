// ============================================================================
// Auth gate for the hidden admin page (dist/admin/index.html)
// ============================================================================
// This is a STATIC site — there is no server to enforce access control, so
// this check is client-side only. That's an acceptable trade-off because:
//   1. The page is unlisted (not linked from any nav, noindex/nofollow).
//   2. Nothing sensitive is meant to ever live directly in this page's HTML/JS
//      (a determined visitor can always view page source). Any real data
//      this dashboard shows in the future should come from Firestore, whose
//      security rules are the actual enforcement boundary — not this file.
//
// Depends on window.FIREBASE_CONFIG from firebase-config.js (loaded before
// this script). Falls back to a friendly message if Firebase isn't
// configured yet, same as js/auth.js does.
// ============================================================================

import {
    initializeApp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signOut,
    signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
    getFirestore, collection, getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

(function () {
    'use strict';

    var ADMIN_EMAIL = 'turkoglu.yavuzalp@gmail.com';

    var states = {
        loading:   document.getElementById('adminLoading'),
        signedOut: document.getElementById('adminSignedOut'),
        forbidden: document.getElementById('adminForbidden'),
        dashboard: document.getElementById('adminDashboard')
    };
    function showState(name) {
        Object.keys(states).forEach(function (k) {
            states[k].classList.toggle('active', k === name);
        });
    }

    var cfg = window.FIREBASE_CONFIG || {};
    var configured = Object.keys(cfg).length > 0 && Object.keys(cfg).every(function (k) {
        return typeof cfg[k] === 'string' && cfg[k].indexOf('REPLACE_ME') === -1;
    });

    if (!configured) {
        states.signedOut.querySelector('.admin-sub').textContent =
            'Sign-in isn\'t set up on this site yet.';
        states.signedOut.querySelector('#adminForm').hidden = true;
        states.signedOut.querySelector('.auth-divider').hidden = true;
        states.signedOut.querySelector('#adminGoogleBtn').hidden = true;
        showState('signedOut');
        return;
    }

    var app  = initializeApp(cfg);
    var auth = getAuth(app);
    var db   = getFirestore(app);

    var form       = document.getElementById('adminForm');
    var emailInput = document.getElementById('adminEmail');
    var passInput  = document.getElementById('adminPassword');
    var errorBox   = document.getElementById('adminError');
    var submitBtn  = document.getElementById('adminSubmitBtn');
    var googleBtn  = document.getElementById('adminGoogleBtn');

    var ERROR_MESSAGES = {
        'auth/invalid-email':        'That email address looks invalid.',
        'auth/user-not-found':       'No account found with that email.',
        'auth/wrong-password':       'Incorrect password.',
        'auth/invalid-credential':   'Incorrect email or password.',
        'auth/too-many-requests':    'Too many attempts. Please wait a moment and try again.',
        'auth/popup-blocked':        'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.'
    };
    function showError(err) {
        errorBox.textContent = ERROR_MESSAGES[err && err.code] || 'Something went wrong. Please try again.';
        errorBox.hidden = false;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errorBox.hidden = true;
        submitBtn.disabled = true;
        signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value)
            .catch(showError)
            .finally(function () { submitBtn.disabled = false; });
    });

    googleBtn.addEventListener('click', function () {
        errorBox.hidden = true;
        signInWithPopup(auth, new GoogleAuthProvider()).catch(function (err) {
            if (err && err.code === 'auth/popup-closed-by-user') return;
            showError(err);
        });
    });

    document.getElementById('forbiddenSignOutBtn').addEventListener('click', function () { signOut(auth); });
    document.getElementById('dashboardSignOutBtn').addEventListener('click', function () { signOut(auth); });

    // ── Dashboard: aggregate solve stats across all users ──
    var statsLoaded = false;

    // The interview-prep page is the single source of truth for which
    // problem ids belong to which pattern/topic — rather than duplicating
    // that mapping here (and letting it drift), fetch the live page and
    // read it out of the DOM.
    function loadProblemCatalog() {
        return fetch('/interview-prep/').then(function (res) { return res.text(); }).then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var catalog = {};
            doc.querySelectorAll('.topic-section').forEach(function (section) {
                var pattern = section.getAttribute('data-topic-name') || section.id;
                section.querySelectorAll('.problem-item').forEach(function (item) {
                    var input = item.querySelector('.prob-check');
                    var link = item.querySelector('a');
                    if (!input) return;
                    catalog[input.getAttribute('data-id')] = {
                        pattern: pattern,
                        title: link ? link.textContent.trim() : input.getAttribute('data-id')
                    };
                });
            });
            return catalog;
        });
    }

    function loadAllSolved() {
        return getDocs(collection(db, 'users')).then(function (snap) {
            var userCount = 0;
            var perProblem = {}; // problemId -> solve count
            var totalEvents = 0;
            snap.forEach(function (docSnap) {
                userCount++;
                var solved = (docSnap.data() && docSnap.data().solved) || {};
                Object.keys(solved).forEach(function (id) {
                    if (!solved[id]) return;
                    totalEvents++;
                    perProblem[id] = (perProblem[id] || 0) + 1;
                });
            });
            return { userCount: userCount, perProblem: perProblem, totalEvents: totalEvents };
        });
    }

    function renderBar(container, label, count, max) {
        var row = document.createElement('div');
        row.className = 'admin-bar-row';
        var pct = max > 0 ? Math.round((count / max) * 100) : 0;
        row.innerHTML =
            '<span class="admin-bar-label" title="' + label + '">' + label + '</span>' +
            '<span class="admin-bar-track"><span class="admin-bar-fill" style="width:' + pct + '%"></span></span>' +
            '<span class="admin-bar-count">' + count + '</span>';
        container.appendChild(row);
    }

    function renderProblemRow(tbody, rank, id, info, count) {
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + rank + '</td>' +
            '<td>' + (info ? info.title : id) + '</td>' +
            '<td>' + (info ? info.pattern : '—') + '</td>' +
            '<td>' + count + '</td>';
        tbody.appendChild(tr);
    }

    function renderDashboardStats(catalog, data) {
        document.getElementById('statUsers').textContent = data.userCount;
        document.getElementById('statSolveEvents').textContent = data.totalEvents;
        document.getElementById('statProblems').textContent = Object.keys(data.perProblem).length;

        // Breakdown by pattern
        var byPattern = {};
        Object.keys(data.perProblem).forEach(function (id) {
            var pattern = (catalog[id] && catalog[id].pattern) || 'Unknown';
            byPattern[pattern] = (byPattern[pattern] || 0) + data.perProblem[id];
        });
        var patternEntries = Object.keys(byPattern).map(function (p) { return [p, byPattern[p]]; });
        patternEntries.sort(function (a, b) { return b[1] - a[1]; });
        var maxPattern = patternEntries.length ? patternEntries[0][1] : 0;
        var patternBars = document.getElementById('patternBars');
        patternBars.innerHTML = '';
        if (patternEntries.length === 0) {
            patternBars.innerHTML = '<p class="admin-placeholder">No solve data yet.</p>';
        } else {
            patternEntries.forEach(function (entry) {
                renderBar(patternBars, entry[0], entry[1], maxPattern);
            });
        }

        // Breakdown by problem, most/least solved
        var problemEntries = Object.keys(data.perProblem).map(function (id) {
            return [id, data.perProblem[id]];
        });
        problemEntries.sort(function (a, b) { return b[1] - a[1]; });

        var topBody = document.getElementById('topProblemsBody');
        var bottomBody = document.getElementById('bottomProblemsBody');
        topBody.innerHTML = '';
        bottomBody.innerHTML = '';

        problemEntries.slice(0, 10).forEach(function (entry, i) {
            renderProblemRow(topBody, i + 1, entry[0], catalog[entry[0]], entry[1]);
        });
        problemEntries.slice(-10).reverse().forEach(function (entry, i) {
            renderProblemRow(bottomBody, i + 1, entry[0], catalog[entry[0]], entry[1]);
        });
    }

    function loadDashboardStats() {
        if (statsLoaded) return;
        statsLoaded = true;
        Promise.all([loadProblemCatalog(), loadAllSolved()]).then(function (results) {
            renderDashboardStats(results[0], results[1]);
            document.getElementById('statsLoading').hidden = true;
            document.getElementById('statsContent').hidden = false;
        }).catch(function (err) {
            console.error('Failed to load admin stats:', err);
            document.getElementById('statsLoading').hidden = true;
            var errBox = document.getElementById('statsError');
            errBox.hidden = false;
            errBox.textContent = (err && err.code === 'permission-denied')
                ? 'Firestore denied this read — the security rules need to grant the admin account read access to the users collection.'
                : 'Something went wrong loading solve stats. Please try again.';
        });
    }

    onAuthStateChanged(auth, function (user) {
        if (!user) {
            showState('signedOut');
        } else if (user.email !== ADMIN_EMAIL) {
            showState('forbidden');
        } else {
            document.getElementById('adminAccountEmail').textContent = user.email;
            document.getElementById('adminAvatar').textContent = user.email.charAt(0).toUpperCase();
            showState('dashboard');
            loadDashboardStats();
        }
    });
})();
