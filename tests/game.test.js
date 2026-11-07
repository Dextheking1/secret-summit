// Game flow tests with the deterministic stub GM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GameStore, MAX_QUESTIONS, MAX_WRONG_GUESSES, THEMES } from '../src/game.js';
import { StubGM } from '../src/gm.js';
import * as flow from '../src/flow.js';

const gm = new StubGM();

function newStore() {
  return new GameStore(null);
}

// Force a known secret by creating the game directly in the store.
function gameWith(store, theme, conceptName, player = 'tester') {
  const concept = THEMES[theme].find((c) => c.name === conceptName);
  assert.ok(concept, `concept ${conceptName} exists`);
  return store.createGame({ theme, player, concept });
}

test('new_game returns rules and no secret', () => {
  const store = newStore();
  const out = flow.newGame(store, { theme: 'animals', player: 'p1' });
  assert.ok(out.game_id);
  assert.equal(out.theme, 'animals');
  assert.match(out.rules, /20 questions/);
  const game = store.getGame(out.game_id);
  assert.ok(!JSON.stringify(out).toLowerCase().includes(game.secret.name.toLowerCase()));
});

test('new_game rejects an unknown theme and picks a random one when omitted', () => {
  const store = newStore();
  const bad = flow.newGame(store, { theme: 'nope' });
  assert.ok(bad.error);
  const ok = flow.newGame(store, {});
  assert.ok(THEMES[ok.theme]);
});

test('ask_question answers from the stub and increments the counter', async () => {
  const store = newStore();
  const game = gameWith(store, 'animals', 'elephant');
  const yes = await flow.askQuestion(store, gm, {
    game_id: game.id,
    question: 'Is it a mammal?',
  });
  assert.equal(yes.answer, 'yes');
  assert.equal(yes.questions_used, 1);
  assert.equal(yes.questions_left, MAX_QUESTIONS - 1);
  const no = await flow.askQuestion(store, gm, {
    game_id: game.id,
    question: 'Does it live in the ocean?',
  });
  assert.equal(no.answer, 'no');
  assert.equal(no.questions_used, 2);
  // the secret must not appear in any output while playing
  assert.ok(!JSON.stringify([yes, no]).includes('elephant'));
});

test('game_state hides the secret while playing and shows history', async () => {
  const store = newStore();
  const game = gameWith(store, 'foods', 'pizza');
  await flow.askQuestion(store, gm, { game_id: game.id, question: 'Is it baked?' });
  const state = flow.gameState(store, { game_id: game.id });
  assert.equal(state.status, 'playing');
  assert.equal(state.questions_used, 1);
  assert.equal(state.secret, undefined);
  assert.equal(state.history.length, 1);
  assert.ok(!JSON.stringify(state).toLowerCase().includes('pizza'));
});

test('correct guess wins, scores, reveals and lands on the leaderboard', async () => {
  const store = newStore();
  const game = gameWith(store, 'animals', 'elephant', 'winner');
  await flow.askQuestion(store, gm, { game_id: game.id, question: 'Is it a mammal?' });
  const win = await flow.makeGuess(store, gm, { game_id: game.id, guess: 'Elephant' });
  assert.equal(win.correct, true);
  assert.equal(win.status, 'won');
  assert.equal(win.secret, 'elephant');
  assert.ok(win.score > 0);
  const board = flow.leaderboard(store);
  assert.equal(board.leaderboard.length, 1);
  assert.equal(board.leaderboard[0].player, 'winner');
  assert.equal(board.leaderboard[0].score, win.score);
  // alias guesses count too
  const game2 = gameWith(store, 'space', 'International Space Station', 'alias-fan');
  const win2 = await flow.makeGuess(store, gm, { game_id: game2.id, guess: 'ISS' });
  assert.equal(win2.correct, true);
});

test('three wrong guesses lose the game and reveal the secret at the end', async () => {
  const store = newStore();
  const game = gameWith(store, 'animals', 'penguin');
  let out;
  for (const g of ['wolf', 'owl', 'frog']) {
    out = await flow.makeGuess(store, gm, { game_id: game.id, guess: g });
    assert.equal(out.correct, false);
    assert.ok(!('secret' in out) || game.status !== 'playing' ? true : false);
    if (game.status === 'playing') assert.ok(!('secret' in out));
  }
  assert.equal(out.status, 'lost');
  assert.equal(out.guesses_left, 0);
  assert.equal(out.secret, 'penguin');
  assert.equal(flow.leaderboard(store).leaderboard.length, 0);
  // no more moves on a finished game
  const late = await flow.askQuestion(store, gm, { game_id: game.id, question: 'Is it a bird?' });
  assert.equal(late.error, 'This game is already over.');
  assert.equal(MAX_WRONG_GUESSES, 3);
});

test('the 20 question cap ends the game', async () => {
  const store = newStore();
  const game = gameWith(store, 'landmarks', 'Big Ben');
  let out;
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    out = await flow.askQuestion(store, gm, {
      game_id: game.id,
      question: `Question number ${i + 1}: is it in Europe?`,
    });
  }
  assert.equal(out.questions_used, MAX_QUESTIONS);
  assert.equal(out.status, 'lost');
  assert.equal(out.secret, 'Big Ben');
  const state = flow.gameState(store, { game_id: game.id });
  assert.equal(state.status, 'lost');
});

test('unknown game ids are errors everywhere', async () => {
  const store = newStore();
  assert.ok((await flow.askQuestion(store, gm, { game_id: 'nope', question: 'x?' })).error);
  assert.ok((await flow.makeGuess(store, gm, { game_id: 'nope', guess: 'x' })).error);
  assert.ok(flow.gameState(store, { game_id: 'nope' }).error);
});

test('persistence keeps active games and the leaderboard across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summit-test-'));
  const file = path.join(dir, 'data.json');
  const store1 = new GameStore(file);
  const game = gameWith(store1, 'foods', 'sushi', 'stayer');
  await flow.askQuestion(store1, gm, { game_id: game.id, question: 'Is it Japanese?' });
  const store2 = new GameStore(file);
  const restored = flow.gameState(store2, { game_id: game.id });
  assert.equal(restored.status, 'playing');
  assert.equal(restored.questions_used, 1);
  const win = await flow.makeGuess(store2, gm, { game_id: game.id, guess: 'sushi' });
  assert.equal(win.correct, true);
  const store3 = new GameStore(file);
  assert.equal(store3.topLeaderboard(10).length, 1);
  assert.equal(store3.topLeaderboard(10)[0].player, 'stayer');
});
