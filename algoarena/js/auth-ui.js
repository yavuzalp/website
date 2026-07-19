// Sign-in modal wiring — same UX pattern as dist/js/auth.js on interview-prep,
// reused here rather than building a parallel auth system. Exports the current
// user via a tiny pub/sub so other modules can react to sign-in/out.
import {
    auth, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup
} from './firebase-init.js';

const listeners = [];
let currentUser = null;

export function onUserChange(cb) {
    listeners.push(cb);
    if (currentUser !== undefined) cb(currentUser);
}

function notify() {
    listeners.forEach(function (cb) { cb(currentUser); });
}

export function requireSignIn() {
    if (currentUser) return true;
    openModal();
    return false;
}

const signInBtn = document.getElementById('signInBtn');
const accountSignedIn = document.getElementById('accountSignedIn');
const accountAvatar = document.getElementById('accountAvatar');
const accountEmail = document.getElementById('accountEmail');
const signOutBtn = document.getElementById('signOutBtn');

const overlay = document.getElementById('authOverlay');
const closeBtn = document.getElementById('authModalClose');
const tabs = document.querySelectorAll('.auth-tab');
const form = document.getElementById('authForm');
const emailInput = document.getElementById('authEmail');
const passwordInput = document.getElementById('authPassword');
const errorBox = document.getElementById('authError');
const submitBtn = document.getElementById('authSubmitBtn');
const googleBtn = document.getElementById('authGoogleBtn');
const modalTitle = document.getElementById('authModalTitle');

let mode = 'signin';

function openModal() {
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (emailInput) emailInput.focus();
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

tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
        mode = tab.dataset.mode;
        tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        modalTitle.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
        submitBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
        errorBox.hidden = true;
    });
});

const ERROR_MESSAGES = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with that email already exists — try signing in instead.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.'
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
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const action = mode === 'signup'
            ? createUserWithEmailAndPassword(auth, email, password)
            : signInWithEmailAndPassword(auth, email, password);
        action.then(function () { closeModal(); })
            .catch(showError)
            .finally(function () { submitBtn.disabled = false; });
    });
}

if (googleBtn) {
    googleBtn.addEventListener('click', function () {
        errorBox.hidden = true;
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).then(function () { closeModal(); })
            .catch(function (err) {
                if (err && err.code === 'auth/popup-closed-by-user') return;
                showError(err);
            });
    });
}

if (signOutBtn) signOutBtn.addEventListener('click', function () { signOut(auth); });

onAuthStateChanged(auth, function (user) {
    currentUser = user;
    if (user) {
        signInBtn.hidden = true;
        accountSignedIn.hidden = false;
        accountEmail.textContent = user.email || '';
        accountAvatar.textContent = (user.displayName || user.email || '?').charAt(0).toUpperCase();
    } else {
        signInBtn.hidden = false;
        accountSignedIn.hidden = true;
    }
    notify();
});
