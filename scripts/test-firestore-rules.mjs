import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'algoarena-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
});

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('PASS - ' + name);
  } catch (e) {
    console.log('FAIL - ' + name + '  (' + e.message.split('\n')[0] + ')');
    failures++;
  }
}

async function run() {
  await testEnv.clearFirestore();

  const host = testEnv.authenticatedContext('host-uid');
  const p2 = testEnv.authenticatedContext('p2-uid');
  const p3 = testEnv.authenticatedContext('p3-uid');
  const anon = testEnv.unauthenticatedContext();

  const hostDb = host.firestore();
  const p2Db = p2.firestore();
  const p3Db = p3.firestore();
  const anonDb = anon.firestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenaProblems', 'p1'), { title: 'Test Problem' });
  });

  await test('anon can read arenaProblems', () => assertSucceeds(getDoc(doc(anonDb, 'arenaProblems', 'p1'))));
  await test('anon cannot write arenaProblems', () => assertFails(setDoc(doc(anonDb, 'arenaProblems', 'p1'), { title: 'hack' })));

  await test('anon cannot create room', () => assertFails(setDoc(doc(anonDb, 'arenaRooms', 'ROOM1'), {
    hostUid: 'x', status: 'waiting'
  })));

  await test('host can create room', () => assertSucceeds(setDoc(doc(hostDb, 'arenaRooms', 'ROOM1'), {
    hostUid: 'host-uid', status: 'waiting', numQuestions: 3
  })));

  await test('p2 cannot create room claiming host-uid', () => assertFails(setDoc(doc(p2Db, 'arenaRooms', 'ROOM2'), {
    hostUid: 'host-uid', status: 'waiting'
  })));

  await test('p2 can create own player doc', () => assertSucceeds(setDoc(doc(p2Db, 'arenaRooms/ROOM1/players/p2-uid'), {
    displayName: 'P2', currentQuestionIndex: 0
  })));
  // p3 also needs to actually be a room member (real players always are, via
  // room.js's joinRoom()) before "any room member can finish the match" is a
  // meaningful thing to test against them below — without this, the later
  // finish-the-room assertions fail for the right reason (not a member) but
  // the wrong scenario (this test means to check a real member finishing).
  await test('p3 can create own player doc', () => assertSucceeds(setDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p3-uid'), {
    displayName: 'P3', currentQuestionIndex: 0
  })));
  await test('p3 cannot create player doc for p2', () => assertFails(setDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p2-uid'), {
    displayName: 'hijack'
  })));

  await test('p3 can read p2 progress', () => assertSucceeds(getDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p2-uid'))));

  await test('p2 cannot start the match', () => assertFails(updateDoc(doc(p2Db, 'arenaRooms', 'ROOM1'), {
    status: 'active', problemIds: ['a', 'b']
  })));
  await test('host can start the match', () => assertSucceeds(updateDoc(doc(hostDb, 'arenaRooms', 'ROOM1'), {
    status: 'active', problemIds: ['a', 'b'], startedAt: serverTimestamp()
  })));

  await test('p2 can write own private submission', () => assertSucceeds(setDoc(doc(p2Db, 'arenaRooms/ROOM1/players/p2-uid/private/probA'), {
    code: 'class Solution { void f() {} }'
  })));
  await test('p3 cannot write p2 private submission', () => assertFails(setDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p2-uid/private/probA'), {
    code: 'sneaky'
  })));

  await test('p3 CANNOT read p2 code while race is active (hard requirement)', () => assertFails(
    getDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p2-uid/private/probA'))
  ));
  await test('p2 can read own code while race is active', () => assertSucceeds(
    getDoc(doc(p2Db, 'arenaRooms/ROOM1/players/p2-uid/private/probA'))
  ));

  await test('p3 can finish the room', () => assertSucceeds(updateDoc(doc(p3Db, 'arenaRooms', 'ROOM1'), {
    status: 'finished', finishedAt: serverTimestamp()
  })));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenaRooms', 'ROOM3'), { hostUid: 'host-uid', status: 'active' });
  });
  await test('non-member cannot finish a room they are not in', () => assertFails(
    updateDoc(doc(p2Db, 'arenaRooms', 'ROOM3'), { status: 'finished', finishedAt: serverTimestamp() })
  ));

  await test('p3 CAN read p2 code once room is finished (reveal-at-end)', () => assertSucceeds(
    getDoc(doc(p3Db, 'arenaRooms/ROOM1/players/p2-uid/private/probA'))
  ));

  console.log('\n' + (failures === 0 ? 'ALL RULES TESTS PASSED' : failures + ' RULES TEST(S) FAILED'));
  await testEnv.cleanup();
  process.exit(failures === 0 ? 0 : 1);
}

run();
