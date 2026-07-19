// ============================================================================
// Firebase Auth + Firestore progress sync for interview-prep.html
// ============================================================================
// Loaded as an ES module (needs native `import`). Depends on:
//   - window.FIREBASE_CONFIG   (set by firebase-config.js, loaded before this)
//   - window.__ipProgress      (set by the inline progress script in
//                                interview-prep.html — getSolved()/applyRemote())
//
// If FIREBASE_CONFIG still has placeholder values, sign-in is disabled and
// the page keeps working exactly as before (localStorage-only progress).
// ============================================================================

import {
    initializeApp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signOut,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
    getFirestore, doc, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

(function () {
    'use strict';

    var cfg = window.FIREBASE_CONFIG || {};
    var configured = Object.keys(cfg).length > 0 && Object.keys(cfg).every(function (k) {
        return typeof cfg[k] === 'string' && cfg[k].indexOf('REPLACE_ME') === -1;
    });

    var signInBtn        = document.getElementById('signInBtn');
    var accountSignedIn  = document.getElementById('accountSignedIn');
    var accountAvatar    = document.getElementById('accountAvatar');
    var accountEmail     = document.getElementById('accountEmail');
    var signOutBtn       = document.getElementById('signOutBtn');

    var overlay           = document.getElementById('authOverlay');
    var closeBtn           = document.getElementById('authModalClose');
    var tabs                = document.querySelectorAll('.auth-tab');
    var form                = document.getElementById('authForm');
    var emailInput          = document.getElementById('authEmail');
    var passwordInput       = document.getElementById('authPassword');
    var errorBox            = document.getElementById('authError');
    var submitBtn           = document.getElementById('authSubmitBtn');
    var googleBtn           = document.getElementById('authGoogleBtn');
    var notConfiguredBox    = document.getElementById('authNotConfigured');
    var authFormsWrap       = document.getElementById('authFormsWrap');
    var modalTitle          = document.getElementById('authModalTitle');

    var mode = 'signin';

    function openModal() {
        if (!overlay) return;
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        if (configured && emailInput) emailInput.focus();
    }
    function closeModal() {
        if (!overlay) return;
        overlay.hidden = true;
        document.body.style.overflow = '';
        if (errorBox) errorBox.hidden = true;
        if (form) form.reset();
    }

    if (signInBtn) signInBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && !overlay.hidden) closeModal();
    });

    if (!configured) {
        // Firebase project not set up yet — leave the modal reachable so the
        // placeholder message is discoverable, but don't touch the Firebase SDK.
        if (notConfiguredBox) notConfiguredBox.hidden = false;
        if (authFormsWrap) authFormsWrap.hidden = true;
        return;
    }

    var app  = initializeApp(cfg);
    var auth = getAuth(app);
    var db   = getFirestore(app);

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            mode = tab.dataset.mode;
            tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
            modalTitle.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
            submitBtn.textContent  = mode === 'signup' ? 'Sign Up' : 'Sign In';
            errorBox.hidden = true;
        });
    });

    var ERROR_MESSAGES = {
        'auth/invalid-email':        'That email address looks invalid.',
        'auth/user-not-found':       'No account found with that email.',
        'auth/wrong-password':       'Incorrect password.',
        'auth/invalid-credential':   'Incorrect email or password.',
        'auth/email-already-in-use': 'An account with that email already exists — try signing in instead.',
        'auth/weak-password':        'Password must be at least 6 characters.',
        'auth/too-many-requests':    'Too many attempts. Please wait a moment and try again.'
    };
    function showError(err) {
        errorBox.textContent = ERROR_MESSAGES[err && err.code] || 'Something went wrong. Please try again.';
        errorBox.hidden = false;
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorBox.hidden = true;
            submitBtn.disabled = true;
            var email = emailInput.value.trim();
            var password = passwordInput.value;
            var action = mode === 'signup'
                ? createUserWithEmailAndPassword(auth, email, password)
                : signInWithEmailAndPassword(auth, email, password);
            action.then(function () {
                closeModal();
            }).catch(showError).finally(function () {
                submitBtn.disabled = false;
            });
        });
    }

    if (googleBtn) {
        googleBtn.addEventListener('click', function () {
            errorBox.hidden = true;
            var provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider).then(function () {
                closeModal();
            }).catch(function (err) {
                if (err && err.code === 'auth/popup-closed-by-user') return;
                showError(err);
            });
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', function () { signOut(auth); });
    }

    // ── Progress sync ──
    var progress = window.__ipProgress;
    var currentUid = null;

    function userDocRef(uid) { return doc(db, 'users', uid); }

    // Merge local (localStorage) progress with whatever's already in
    // Firestore for this account, favoring "solved" over "unsolved" on both
    // sides (a merge should never lose progress recorded on either device).
    function mergeAndSync(uid) {
        var local = progress.getSolved() || {};
        return getDoc(userDocRef(uid)).then(function (snap) {
            var remote = (snap.exists() && snap.data().solved) || {};
            var merged = {};
            Object.keys(remote).forEach(function (k) { if (remote[k]) merged[k] = true; });
            Object.keys(local).forEach(function (k) { if (local[k]) merged[k] = true; });

            var remoteKeys = Object.keys(remote).filter(function (k) { return remote[k]; });
            var mergedKeys = Object.keys(merged);
            var changed = mergedKeys.length !== remoteKeys.length;

            progress.applyRemote(merged);

            if (changed) {
                return setDoc(userDocRef(uid), { solved: merged, updatedAt: Date.now() }, { merge: true });
            }
        });
    }

    onAuthStateChanged(auth, function (user) {
        if (user) {
            currentUid = user.uid;
            signInBtn.hidden = true;
            accountSignedIn.hidden = false;
            accountEmail.textContent = user.email || '';
            accountAvatar.textContent = (user.email || '?').charAt(0).toUpperCase();
            mergeAndSync(user.uid).catch(function (err) {
                console.error('Progress sync failed:', err);
            });
        } else {
            currentUid = null;
            signInBtn.hidden = false;
            accountSignedIn.hidden = true;
        }
    });

    // Called by the inline progress script after every checkbox change.
    window.__ipAuthSync = function (id, checked) {
        if (!currentUid) return;
        var partial = {};
        partial['solved.' + id] = checked;
        setDoc(userDocRef(currentUid), partial, { merge: true }).catch(function (err) {
            console.error('Progress sync failed:', err);
        });
    };

    // Called by the inline progress script when the user clicks "Reset".
    window.__ipAuthReset = function () {
        if (!currentUid) return;
        setDoc(userDocRef(currentUid), { solved: {} }, { merge: true }).catch(function (err) {
            console.error('Progress reset sync failed:', err);
        });
    };
})();
