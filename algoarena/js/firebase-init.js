// Shared Firebase bootstrap for AlgoArena. Reuses the SAME Firebase project
// as interview-prep (yavuzalpturkoglu) — same auth users, same billing, no
// new infrastructure. Config values are public (see dist/firebase-config.js
// for why that's safe); access control lives in firestore.rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signOut,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
    getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot,
    collection, serverTimestamp, runTransaction, deleteField
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDtZ7znOjIV5cj-hKtwwnlgUjjAMNUDlj0",
    authDomain: "yavuzalpturkoglu.firebaseapp.com",
    projectId: "yavuzalpturkoglu",
    storageBucket: "yavuzalpturkoglu.firebasestorage.app",
    messagingSenderId: "578028168703",
    appId: "1:578028168703:web:d2c6bd9755accec3bbf3ca"
};

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
    onAuthStateChanged, signOut, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
    doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, collection,
    serverTimestamp, runTransaction, deleteField
};
