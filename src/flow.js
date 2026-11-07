// Game flow: the rules of play, shared by the MCP tools and the tests.

import {
  THEMES,
  MAX_QUESTIONS,
  MAX_WRONG_GUESSES,
  pickConcept,
  publicState,
} from './game.js';

export const RULES =
  `Secret Summit is a 20 questions game. The game master has picked a secret concept from the theme. ` +
  `Ask up to ${MAX_QUESTIONS} yes/no questions with ask_question, then name the concept with guess. ` +
  `You have ${MAX_WRONG_GUESSES} guesses. The game ends when you guess right, run out of guesses, or run out of questions. ` +
  `Fewer questions means a better score. Finished wins land on the leaderboard.`;

export function err(message) {
  return { error: message };
}

export function newGame(store, { theme, player } = {}) {
  const names = Object.keys(THEMES);
  let t = theme && THEMES[theme] ? theme : null;
  if (theme && !t) {
    return err(`Unknown theme "${theme}". Themes: ${names.join(', ')}`);
  }
  if (!t) t = names[Math.floor(Math.random() * names.length)];
  const concept = pickConcept(t);
  const game = store.createGame({ theme: t, player, concept });
  return {
    game_id: game.id,
    player: game.player,
    theme: game.theme,
    rules: RULES,
    questions_left: MAX_QUESTIONS,
    guesses_left: MAX_WRONG_GUESSES,
    status: game.status,
    next: 'Call ask_question with a yes/no question, or guess if you already know.',
  };
}

export async function askQuestion(store, gm, { game_id, question }) {
  const game = store.getGame(game_id);
  if (!game) return err(`No game with id "${game_id}". Start one with new_game.`);
  if (game.status !== 'playing') {
    return { ...publicState(game), error: 'This game is already over.' };
  }
  const q = String(question || '').trim();
  if (!q) return err('question is required.');
  if (game.questions.length >= MAX_QUESTIONS) {
    store.finishGame(game, false);
    return { ...publicState(game), note: 'Out of questions. Game over.' };
  }
  const res = await gm.answerQuestion(game.secret, game.theme, game.questions, q);
  game.questions.push({ question: q, answer: res.answer });
  let note = null;
  if (game.questions.length >= MAX_QUESTIONS) {
    store.finishGame(game, false);
    note = 'That was the last question. Game over.';
  } else {
    store.save();
  }
  const out = {
    game_id: game.id,
    answer: res.answer,
    questions_used: game.questions.length,
    questions_left: MAX_QUESTIONS - game.questions.length,
    guesses_left: MAX_WRONG_GUESSES - game.wrongGuesses.length,
    status: game.status,
  };
  if (res.hint) out.hint = res.hint;
  if (note) {
    out.note = note;
    out.secret = game.secret.name;
    out.score = game.score;
  }
  return out;
}

export async function makeGuess(store, gm, { game_id, guess }) {
  const game = store.getGame(game_id);
  if (!game) return err(`No game with id "${game_id}". Start one with new_game.`);
  if (game.status !== 'playing') {
    return { ...publicState(game), error: 'This game is already over.' };
  }
  const g = String(guess || '').trim();
  if (!g) return err('guess is required.');
  const verdict = await gm.judgeGuess(game.secret, g);
  if (verdict.correct) {
    store.finishGame(game, true);
    return {
      game_id: game.id,
      correct: true,
      status: game.status,
      secret: game.secret.name,
      questions_used: game.questions.length,
      wrong_guesses: game.wrongGuesses.length,
      score: game.score,
      message: `Correct. The secret was "${game.secret.name}". Score ${game.score} with ${game.questions.length} questions used.`,
    };
  }
  game.wrongGuesses.push(g);
  let note = null;
  if (game.wrongGuesses.length >= MAX_WRONG_GUESSES) {
    store.finishGame(game, false);
    note = 'Out of guesses. Game over.';
  } else {
    store.save();
  }
  const out = {
    game_id: game.id,
    correct: false,
    status: game.status,
    wrong_guesses: game.wrongGuesses,
    guesses_left: MAX_WRONG_GUESSES - game.wrongGuesses.length,
    questions_used: game.questions.length,
    questions_left: MAX_QUESTIONS - game.questions.length,
  };
  if (note) {
    out.note = note;
    out.secret = game.secret.name;
  }
  return out;
}

export function gameState(store, { game_id }) {
  const game = store.getGame(game_id);
  if (!game) return err(`No game with id "${game_id}". Start one with new_game.`);
  return publicState(game);
}

export function leaderboard(store) {
  return { leaderboard: store.topLeaderboard(10) };
}
