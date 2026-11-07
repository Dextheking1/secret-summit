// MCP protocol smoke test: spawn the real server with the stub GM,
// then drive it with the official SDK client over Streamable HTTP.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const PORT = 18799;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let proc;
let client;

async function waitForHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not come up');
}

function parseToolText(result) {
  const text = result.content.find((c) => c.type === 'text')?.text;
  return JSON.parse(text);
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summit-mcp-'));
  proc = spawn('node', ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      GM_STUB: '1',
      DATA_FILE: path.join(dir, 'data.json'),
    },
    stdio: 'pipe',
  });
  await waitForHealth();
  client = new Client({ name: 'secret-summit-test', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE_URL}/mcp`)));
});

after(async () => {
  try {
    await client?.close();
  } catch {}
  proc?.kill('SIGTERM');
});

test('landing page serves over HTTP', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Secret Summit/);
  assert.match(html, /pollinations\.ai/);
});

test('tools/list exposes the five game tools', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['ask_question', 'game_state', 'guess', 'leaderboard', 'new_game']);
});

test('how_to_play resource and prompt are served', async () => {
  const resources = await client.listResources();
  assert.ok(resources.resources.some((r) => r.uri === 'summit://how-to-play'));
  const read = await client.readResource({ uri: 'summit://how-to-play' });
  assert.match(read.contents[0].text, /new_game/);
  const prompt = await client.getPrompt({ name: 'how_to_play' });
  assert.match(prompt.messages[0].content.text, /20 questions/);
});

test('a full game over MCP: new_game, ask, guess, state', async () => {
  const started = parseToolText(
    await client.callTool({ name: 'new_game', arguments: { theme: 'animals', player_name: 'mcp-tester' } })
  );
  assert.ok(started.game_id);
  assert.equal(started.questions_left, 20);

  const asked = parseToolText(
    await client.callTool({
      name: 'ask_question',
      arguments: { game_id: started.game_id, question: 'Is it alive?' },
    })
  );
  assert.ok(['yes', 'no', 'irrelevant'].includes(asked.answer));
  assert.equal(asked.questions_used, 1);

  const guessed = parseToolText(
    await client.callTool({
      name: 'guess',
      arguments: { game_id: started.game_id, guess: 'zz not a real animal zz' },
    })
  );
  assert.equal(guessed.correct, false);
  assert.equal(guessed.guesses_left, 2);
  assert.ok(!('secret' in guessed));

  const state = parseToolText(
    await client.callTool({ name: 'game_state', arguments: { game_id: started.game_id } })
  );
  assert.equal(state.status, 'playing');
  assert.equal(state.questions_used, 1);
  assert.equal(state.secret, undefined);

  const board = parseToolText(await client.callTool({ name: 'leaderboard', arguments: {} }));
  assert.ok(Array.isArray(board.leaderboard));
});
