// Example agent player for Secret Summit.
//
// An LLM (via Pollinations) plays a full game over MCP: it reads the
// candidate list for the theme, asks yes/no questions, and guesses.
// This is a demo of the intended use: any agent that can speak MCP can
// play the same way.
//
// Usage:
//   POLLINATIONS_API_KEY=... node examples/play.mjs [baseUrl] [theme] [playerName]
// Defaults: baseUrl http://127.0.0.1:18760, theme animals.
// The key is only for the player brain. Playing itself needs no key.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { THEMES } from '../src/game.js';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:18760').replace(/\/$/, '');
const theme = process.argv[3] || 'animals';
const playerName = process.argv[4] || 'example-agent';
const apiKey = process.env.POLLINATIONS_API_KEY || '';
const playerModel = process.env.PLAYER_MODEL || 'z-ai/glm-5.3-flash';

function parseToolText(result) {
  return JSON.parse(result.content.find((c) => c.type === 'text').text);
}

async function think(history, candidates, questionsLeft, guessesLeft) {
  const prompt =
    `You are playing a 20 questions guessing game. Theme: ${theme}.\n` +
    `The secret is one of these candidates: ${candidates.join(', ')}.\n` +
    `Q and A history so far:\n${history.map((h) => `Q: ${h.question} A: ${h.answer}`).join('\n') || '(none)'}\n` +
    `Questions left: ${questionsLeft}. Guesses left: ${guessesLeft}.\n` +
    `Decide the next move. Ask a yes/no question that splits the remaining candidates well, ` +
    `or guess when one candidate clearly fits all answers.\n` +
    `Reply with strict JSON only: {"type":"question","text":"..."} or {"type":"guess","text":"..."}`;
  const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: playerModel,
      messages: [{ role: 'user', content: prompt }],
      reasoning_effort: 'low',
      max_tokens: 4000,
    }),
  });
  if (!res.ok) throw new Error(`player model HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices[0].message.content;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  return JSON.parse(content.slice(start, end + 1));
}

const client = new Client({ name: 'secret-summit-example-player', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));

const started = parseToolText(
  await client.callTool({ name: 'new_game', arguments: { theme, player_name: playerName } })
);
console.log(`game ${started.game_id} theme=${theme} player=${playerName}`);
const candidates = THEMES[theme].map((c) => c.name);
const history = [];
let final = null;

for (let turn = 0; turn < 30; turn++) {
  const state = parseToolText(
    await client.callTool({ name: 'game_state', arguments: { game_id: started.game_id } })
  );
  if (state.status !== 'playing') {
    final = state;
    break;
  }
  const move = await think(history, candidates, state.questions_left, state.guesses_left);
  if (move.type === 'guess') {
    const out = parseToolText(
      await client.callTool({ name: 'guess', arguments: { game_id: started.game_id, guess: move.text } })
    );
    console.log(`guess: ${move.text} -> correct=${out.correct}`);
    if (out.correct || out.status !== 'playing') {
      final = out;
      break;
    }
  } else {
    const out = parseToolText(
      await client.callTool({
        name: 'ask_question',
        arguments: { game_id: started.game_id, question: move.text },
      })
    );
    console.log(`Q${out.questions_used}: ${move.text} -> ${out.answer}`);
    history.push({ question: move.text, answer: out.answer });
    if (out.status !== 'playing') {
      final = out;
      break;
    }
  }
}

console.log('final:', JSON.stringify(final));
const board = parseToolText(await client.callTool({ name: 'leaderboard', arguments: {} }));
console.log('leaderboard:', JSON.stringify(board.leaderboard.slice(0, 5)));
await client.close();
