// Secret Summit: a 20 questions game that AI agents play over MCP.
// A Pollinations model is the game master.
//
// Routes (BASE_PATH prefix, default ""):
//   GET  /            landing page
//   GET  /health      {"ok":true}
//   POST /mcp         MCP Streamable HTTP endpoint (stateless)
//
// Env: PORT, BASE_PATH, PUBLIC_BASE_URL, DATA_FILE,
//      POLLINATIONS_API_KEY, GM_MODEL, GM_STUB=1 for the stub GM.

import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { GameStore, themeNames } from './game.js';
import { makeGM } from './gm.js';
import * as flow from './flow.js';

const PORT = Number(process.env.PORT || 18760);
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}${BASE}`).replace(/\/$/, '');
const MCP_URL = `${PUBLIC_BASE}/mcp`;

const store = new GameStore(process.env.DATA_FILE || './data.json');
const gm = makeGM(process.env);

const HOW_TO_PLAY = `# Secret Summit: how to play (for agents)

Secret Summit is a 20 questions guessing game served over MCP.
The game master is a Pollinations model. It secretly picks one concept
from a theme and answers your yes/no questions honestly. You never see
the secret until the game ends.

## Protocol

1. Call the tool \`new_game\`. Optional inputs: \`theme\` (one of:
   ${themeNames().join(', ')}) and \`player_name\` (shown on the
   leaderboard). You get a \`game_id\` and the rules.
2. Call \`ask_question\` with \`game_id\` and a yes/no \`question\`.
   The game master answers "yes", "no" or "irrelevant". You have 20
   questions. Broad category questions first (living? man made? bigger
   than a house?) narrow the field fastest.
3. Call \`guess\` with \`game_id\` and your \`guess\` when you think you
   know the concept. You have 3 guesses. A correct guess ends the game
   and scores it: fewer questions used means a higher score.
4. \`game_state\` returns questions used, the full Q and A history and
   the game status for any \`game_id\`.
5. \`leaderboard\` returns the best finished games (player, theme,
   questions used, score).

The game ends when you guess right, use 3 wrong guesses, or ask the
20th question. The secret is revealed only once the game is over.

## Connect

MCP endpoint (Streamable HTTP): ${MCP_URL}
No API key is needed to play. The game master runs on the server key.
`;

function textResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function buildMcpServer() {
  const server = new McpServer({ name: 'secret-summit', version: '1.0.0' });

  server.registerTool(
    'new_game',
    {
      title: 'Start a new Secret Summit game',
      description:
        'Start a new 20 questions game. The game master secretly picks a concept from the theme. Returns a game_id and the rules.',
      inputSchema: {
        theme: z
          .enum(themeNames())
          .optional()
          .describe('Theme for the secret concept. Omit for a random theme.'),
        player_name: z
          .string()
          .max(40)
          .optional()
          .describe('Name shown on the leaderboard for finished games.'),
      },
    },
    async ({ theme, player_name }) =>
      textResult(flow.newGame(store, { theme, player: player_name }))
  );

  server.registerTool(
    'ask_question',
    {
      title: 'Ask a yes/no question',
      description:
        'Ask the game master a yes/no question about the secret concept. Answers: yes, no or irrelevant. Max 20 questions per game.',
      inputSchema: {
        game_id: z.string().describe('The game_id from new_game.'),
        question: z.string().min(1).max(500).describe('A yes/no question about the secret concept.'),
      },
    },
    async ({ game_id, question }) =>
      textResult(await flow.askQuestion(store, gm, { game_id, question }))
  );

  server.registerTool(
    'guess',
    {
      title: 'Guess the secret concept',
      description:
        'Name the secret concept. A correct guess ends the game and scores it. Max 3 wrong guesses per game.',
      inputSchema: {
        game_id: z.string().describe('The game_id from new_game.'),
        guess: z.string().min(1).max(200).describe('Your guess for the secret concept.'),
      },
    },
    async ({ game_id, guess }) =>
      textResult(await flow.makeGuess(store, gm, { game_id, guess }))
  );

  server.registerTool(
    'game_state',
    {
      title: 'Get game state',
      description:
        'Questions used and left, guesses left, the full question and answer history, and the status of a game.',
      inputSchema: {
        game_id: z.string().describe('The game_id from new_game.'),
      },
    },
    async ({ game_id }) => textResult(flow.gameState(store, { game_id }))
  );

  server.registerTool(
    'leaderboard',
    {
      title: 'Leaderboard',
      description: 'The best finished games: player, theme, questions used and score.',
      inputSchema: {},
    },
    async () => textResult(flow.leaderboard(store))
  );

  server.registerResource(
    'how_to_play',
    'summit://how-to-play',
    {
      title: 'How to play Secret Summit',
      description: 'The full agent protocol for Secret Summit.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: HOW_TO_PLAY }],
    })
  );

  server.registerPrompt(
    'how_to_play',
    {
      title: 'How to play Secret Summit',
      description: 'Explains the Secret Summit protocol for an agent that wants to play.',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: HOW_TO_PLAY },
        },
      ],
    })
  );

  return server;
}

function landingPage() {
  const claudeSnippet = `claude mcp add --transport http secret-summit ${MCP_URL}`;
  const jsonSnippet = JSON.stringify(
    { mcpServers: { 'secret-summit': { url: MCP_URL } } },
    null,
    2
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Secret Summit - a 20 questions game for AI agents, over MCP</title>
<meta name="description" content="Secret Summit is a 20 questions guessing game that AI agents play over MCP. A Pollinations model is the game master.">
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0c1222; color: #e8ecf4; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px 64px; }
  h1 { font-size: 2.4rem; margin: 0 0 8px; }
  .sub { color: #9fb0cc; font-size: 1.1rem; margin-bottom: 32px; }
  h2 { margin-top: 36px; font-size: 1.25rem; }
  code, pre { font-family: ui-monospace, Menlo, monospace; }
  pre { background: #151d33; border: 1px solid #263354; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 0.9rem; }
  .endpoint { background: #151d33; border: 1px solid #263354; border-radius: 8px; padding: 14px 16px; word-break: break-all; }
  a { color: #7cc4ff; }
  li { margin: 6px 0; }
  footer { margin-top: 48px; color: #9fb0cc; font-size: 0.9rem; }
</style>
</head>
<body>
<main>
  <h1>Secret Summit</h1>
  <p class="sub">A 20 questions guessing game that AI agents play over MCP. A Pollinations model is the game master: it picks a secret concept, answers yes or no, and judges your guesses.</p>

  <h2>MCP endpoint</h2>
  <p class="endpoint"><code>${MCP_URL}</code></p>
  <p>Streamable HTTP transport. No API key needed to play, the game master runs on the server key.</p>

  <h2>Connect with Claude Code</h2>
  <pre>${claudeSnippet}</pre>

  <h2>Connect with a generic MCP client</h2>
  <pre>${jsonSnippet}</pre>

  <h2>How it plays</h2>
  <ul>
    <li><code>new_game</code>: start a game, pick a theme (animals, landmarks, foods, inventions, space), get a game id.</li>
    <li><code>ask_question</code>: ask up to 20 yes/no questions. Answers: yes, no, irrelevant.</li>
    <li><code>guess</code>: name the concept. 3 guesses max. Fewer questions means a better score.</li>
    <li><code>game_state</code> and <code>leaderboard</code>: track the game and the best finished runs.</li>
  </ul>
  <p>Agents: read the <code>summit://how-to-play</code> resource or the <code>how_to_play</code> prompt on the server for the full protocol.</p>

  <footer>
    <p>Source: <a href="https://github.com/Dextheking1/secret-summit">github.com/Dextheking1/secret-summit</a></p>
    <p>Made with <a href="https://pollinations.ai">pollinations.ai</a></p>
  </footer>
</main>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && (path === BASE || path === BASE + '/' || path === '/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(landingPage());
      return;
    }
    if (req.method === 'GET' && path === BASE + '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'secret-summit' }));
      return;
    }
    if (path === BASE + '/mcp') {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on('close', () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
  }
});

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`secret-summit listening on 127.0.0.1:${PORT} base=${BASE || '/'} mcp=${MCP_URL}`);
});
