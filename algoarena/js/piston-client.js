// Talks to the self-hosted piston-service proxy (see /piston-service). The
// proxy — not this client — holds the hidden test cases and assembles the
// grading driver script, so a player can never read expected outputs by
// inspecting network traffic or Firestore.
import { auth } from './firebase-init.js';

export function isConfigured() {
    const url = window.ALGOARENA_API_URL || '';
    return url && url.indexOf('REPLACE_ME') === -1;
}

export async function runSubmission(problemId, code) {
    if (!isConfigured()) {
        throw new Error('Code execution isn\'t configured yet — the site owner needs to deploy piston-service and set ALGOARENA_API_URL (see piston-config.js).');
    }
    const user = auth.currentUser;
    if (!user) throw new Error('You must be signed in.');
    const idToken = await user.getIdToken();

    const res = await fetch(window.ALGOARENA_API_URL.replace(/\/$/, '') + '/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + idToken
        },
        body: JSON.stringify({ problemId: problemId, code: code })
    });

    if (!res.ok) {
        let msg = 'Execution failed (' + res.status + ')';
        try {
            const body = await res.json();
            if (body.error) msg = body.error;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return res.json(); // { results: [{passed, actual, hidden, ms, error?}], allPassed, passCount, totalCount }
}
