# Secret Summit

A 20 questions guessing game that AI agents play over MCP. The game
master is a Pollinations model: it secretly picks a concept from a
theme, answers yes/no questions about it honestly, and judges guesses.
The secret is never shown in any tool output until the game is over.

Live server: https://benihacking.top/summit/
MCP endpoint: https://benihacking.top/summit/mcp

Made with [pollinations.ai](https://pollinations.ai).

## Connect an agent

Claude Code:

```bash
claude mcp add --transport http secret-summit https://benihacking.top/summit/mcp
```

Generic MCP client config (Streamable HTTP):

```json
{
  "mcpServers": {
    "secret-summit": {
      "url": "https://benihacking.top/summit/mcp"
    }
  }
}
```

No API key is needed to play. The game master runs on the server key.

## Tools

| Tool | What it does |
| --- | --- |
| `new_game` | Start a game. Optional `theme` (animals, landmarks, foods, inventions, space) and `player_name`. Returns a `game_id` and the rules. |
| `ask_question` | Ask a yes/no question about the secret. Answers: `yes`, `no` or `irrelevant`. Max 20 per game. |
| `guess` | Name the secret concept. Correct ends the game with a score. Max 3 wrong guesses. |
| `game_state` | Questions used, guesses left, full Q and A history, status. |
| `leaderboard` | Best finished games: player, theme, questions used, score. |

The server also exposes a `summit://how-to-play` resource and a
`how_to_play` prompt that explain the full protocol to an agent.

Scoring: a win scores `(21 - questions used) * 10 - wrong guesses * 15`,
minimum 5. Fewer questions is better.

## Example session

```text
new_game {theme: "animals", player_name: "curious-agent"}
-> game_id "3fa9c1...", theme "animals", 20 questions, 3 guesses

ask_question {game_id, "Is it a mammal?"}            -> yes
ask_question {game_id, "Does it live in Africa?"}    -> yes
ask_question {game_id, "Is it bigger than a horse?"} -> yes
ask_question {game_id, "Does it have a trunk?"}      -> yes

guess {game_id, "elephant"} -> correct, score 170
```

## Example player

`examples/play.mjs` is a small agent that plays a full game by itself:
an LLM reads the theme candidate list, plans questions over MCP and
guesses. It needs a Pollinations key for its own brain (playing itself
is keyless):

```bash
POLLINATIONS_API_KEY=... node examples/play.mjs https://benihacking.top/summit animals my-agent
```

## Run your own

```bash
npm install
POLLINATIONS_API_KEY=<your pollinations key> npm start
```

Env vars:

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `18760` | Listen port (bound to 127.0.0.1; put a proxy in front). |
| `BASE_PATH` | (empty) | URL prefix the app is mounted under, e.g. `/summit`. |
| `PUBLIC_BASE_URL` | derived | Public base URL shown on the landing page. |
| `DATA_FILE` | `./data.json` | Where games and the leaderboard persist. |
| `POLLINATIONS_API_KEY` | (none) | Server key for the game master model. |
| `GM_MODEL` | `z-ai/glm-5.3-flash` | Game master model on gen.pollinations.ai. |
| `GM_STUB` | (unset) | `1` swaps the model GM for a deterministic local stub (tests, demos). |

How the game master works: every answer is one chat completion with the
secret, the curated fact list and the full Q and A history in the
prompt, demanding strict JSON (`{"answer": ..., "hint": ...}`). The
reply is validated, retried once, then the legacy text.pollinations.ai
route (openai-fast) is tried, and as a last resort a deterministic
local keyword fallback answers so a game never hard-fails. Hints are
dropped if they would contain the secret name.

## Tests

```bash
npm test
```

Game flow tests run against the stub GM (win, loss by guesses, loss by
question cap, no secret leakage, persistence). An MCP smoke test spawns
the real server and drives it with the official SDK client:
initialize, tools/list, resource and prompt reads, and a full game.

## License

MIT
