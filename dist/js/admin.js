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

    onAuthStateChanged(auth, function (user) {
        if (!user) {
            showState('signedOut');
        } else if (user.email !== ADMIN_EMAIL) {
            showState('forbidden');
        } else {
            document.getElementById('adminAccountEmail').textContent = user.email;
            document.getElementById('adminAvatar').textContent = user.email.charAt(0).toUpperCase();
            showState('dashboard');
        }
    });
})();
