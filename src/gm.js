// Game master client: a Pollinations model holds the secret and answers
// yes/no questions about it, and judges guesses.
//
// Primary route: POST https://gen.pollinations.ai/v1/chat/completions
// with the server key, reasoning_effort "low" and max_tokens 4000
// (reasoning models reject tiny token caps). If the primary route
// fails, falls back to the legacy text.pollinations.ai route
// (openai-fast, no key). If both fail or return unusable JSON after
// one retry, callers use the deterministic local fallback in game.js.

import { localMatch, fallbackAnswer } from './game.js';

const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const LEGACY_URL = 'https://text.pollinations.ai/';

export function extractJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const ANSWER_RULES = `You are the game master of Secret Summit, a 20 questions guessing game.
You hold one secret concept and answer a player's yes/no questions about it honestly.
Reply with strict JSON only, no prose, no code fences:
{"answer": "yes" | "no" | "irrelevant", "hint": string or null}
- "yes" when the statement in the question is true for the secret concept.
- "no" when it is false.
- "irrelevant" when the question does not apply to the concept at all
  (for example asking about the color of a sound, or a property the
  concept cannot have either way).
- Never name or describe the secret itself. Never put the secret name
  in the hint.
- "hint" is normally null. Only after the player has used 10 or more
  questions you may add one short hint that narrows the field without
  naming the secret.`;

export class PollinationsGM {
  constructor({ apiKey, model } = {}) {
    this.apiKey = apiKey || '';
    this.model = model || 'z-ai/glm-5.3-flash';
  }

  async callGen(messages) {
    const res = await fetch(GEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`gen route HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('gen route: no content');
    return content;
  }

  async callLegacy(messages) {
    const res = await fetch(LEGACY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: 'openai-fast' }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`legacy route HTTP ${res.status}`);
    const text = await res.text();
    if (!text) throw new Error('legacy route: empty reply');
    return text;
  }

  // One transport attempt with a parse; null on any failure.
  async tryJSON(messages, transport) {
    try {
      const raw = await transport(messages);
      return extractJSON(raw);
    } catch {
      return null;
    }
  }

  async chatJSON(messages) {
    // primary route, one retry
    let out = await this.tryJSON(messages, (m) => this.callGen(m));
    if (out) return out;
    out = await this.tryJSON(messages, (m) => this.callGen(m));
    if (out) return out;
    // legacy fallback route, one retry
    out = await this.tryJSON(messages, (m) => this.callLegacy(m));
    if (out) return out;
    out = await this.tryJSON(messages, (m) => this.callLegacy(m));
    return out; // may be null
  }

  async answerQuestion(concept, theme, history, question) {
    const hist = history
      .map((h, i) => `${i + 1}. Q: ${h.question} A: ${h.answer}`)
      .join('\n');
    const messages = [
      { role: 'system', content: ANSWER_RULES },
      {
        role: 'user',
        content:
          `Theme: ${theme}\nSecret concept: ${concept.name}\n` +
          `Known facts about the secret: ${(concept.facts || []).join(', ')}\n` +
          `Questions so far (${history.length}):\n${hist || '(none)'}\n` +
          `New question: ${question}\n` +
          `Reply with the strict JSON answer object only.`,
      },
    ];
    const parsed = await this.chatJSON(messages);
    if (parsed && ['yes', 'no', 'irrelevant'].includes(parsed.answer)) {
      let hint = null;
      if (typeof parsed.hint === 'string' && parsed.hint.trim()) {
        // safety: a hint must never contain the secret name
        const h = parsed.hint.trim().slice(0, 200);
        if (!h.toLowerCase().includes(concept.name.toLowerCase())) hint = h;
      }
      return { answer: parsed.answer, hint, source: 'model' };
    }
    return { answer: fallbackAnswer(concept, question), hint: null, source: 'fallback' };
  }

  async judgeGuess(concept, guessText) {
    if (localMatch(concept, guessText)) return { correct: true, source: 'exact' };
    const messages = [
      {
        role: 'system',
        content:
          'You judge guesses in a guessing game. Reply with strict JSON only: {"correct": true} or {"correct": false}. ' +
          'correct is true only when the guess names the same concept as the secret: synonyms, translations, ' +
          'plural or spelling variants of the same thing count. A broader category, a part of it, or a related ' +
          'but different thing does not count.',
      },
      {
        role: 'user',
        content: `Secret concept: ${concept.name}\nPlayer guess: ${guessText}\nReply with the strict JSON verdict only.`,
      },
    ];
    const parsed = await this.chatJSON(messages);
    if (parsed && typeof parsed.correct === 'boolean') {
      return { correct: parsed.correct, source: 'model' };
    }
    return { correct: false, source: 'fallback' };
  }
}

// Deterministic stub used by the test suite and local smoke runs
// (GM_STUB=1). Answers from the curated fact lists, judges by exact
// or alias match only.
export class StubGM {
  async answerQuestion(concept, theme, history, question) {
    return { answer: fallbackAnswer(concept, question), hint: null, source: 'stub' };
  }
  async judgeGuess(concept, guessText) {
    return { correct: localMatch(concept, guessText), source: 'stub' };
  }
}

export function makeGM(env = process.env) {
  if (env.GM_STUB === '1') return new StubGM();
  return new PollinationsGM({
    apiKey: env.POLLINATIONS_API_KEY || '',
    model: env.GM_MODEL || 'z-ai/glm-5.3-flash',
  });
}
