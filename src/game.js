// Secret Summit game logic: themes, game state, rules, persistence.
// No network code here. The game master (GM) is injected, which keeps
// the whole flow testable with a stub GM.

import fs from 'node:fs';
import crypto from 'node:crypto';

export const MAX_QUESTIONS = 20;
export const MAX_WRONG_GUESSES = 3;

export const THEMES = {
  animals: [
    { name: 'elephant', aliases: ['african elephant', 'asian elephant'], facts: ['mammal', 'land', 'africa', 'asia', 'big', 'large', 'gray', 'grey', 'trunk', 'tusks', 'herbivore', 'four legs', 'ears'] },
    { name: 'penguin', aliases: [], facts: ['bird', 'flightless', 'antarctica', 'cold', 'swims', 'black and white', 'feathers', 'eggs'] },
    { name: 'octopus', aliases: [], facts: ['sea', 'ocean', 'eight arms', 'tentacles', 'invertebrate', 'ink', 'camouflage', 'smart'] },
    { name: 'giraffe', aliases: [], facts: ['mammal', 'land', 'africa', 'tall', 'long neck', 'spots', 'herbivore', 'four legs'] },
    { name: 'polar bear', aliases: [], facts: ['mammal', 'arctic', 'cold', 'white', 'bear', 'carnivore', 'swims', 'fur'] },
    { name: 'kangaroo', aliases: [], facts: ['mammal', 'australia', 'pouch', 'hops', 'jumps', 'marsupial', 'herbivore', 'tail'] },
    { name: 'owl', aliases: [], facts: ['bird', 'nocturnal', 'flies', 'night', 'eyes', 'feathers', 'carnivore', 'hoots'] },
    { name: 'shark', aliases: ['great white shark'], facts: ['fish', 'ocean', 'sea', 'teeth', 'predator', 'fins', 'carnivore', 'swims'] },
    { name: 'butterfly', aliases: [], facts: ['insect', 'flies', 'wings', 'colorful', 'metamorphosis', 'caterpillar', 'small'] },
    { name: 'wolf', aliases: ['gray wolf', 'grey wolf'], facts: ['mammal', 'pack', 'howls', 'carnivore', 'four legs', 'wild', 'dog family'] },
    { name: 'dolphin', aliases: [], facts: ['mammal', 'ocean', 'sea', 'swims', 'smart', 'echolocation', 'fins'] },
    { name: 'snake', aliases: [], facts: ['reptile', 'no legs', 'slithers', 'scales', 'long', 'carnivore'] },
    { name: 'eagle', aliases: ['bald eagle'], facts: ['bird', 'flies', 'predator', 'beak', 'talons', 'feathers', 'wings'] },
    { name: 'frog', aliases: [], facts: ['amphibian', 'jumps', 'pond', 'green', 'tadpole', 'croaks', 'small'] },
    { name: 'horse', aliases: [], facts: ['mammal', 'land', 'domestic', 'rides', 'hooves', 'four legs', 'herbivore', 'mane'] },
    { name: 'bat', aliases: [], facts: ['mammal', 'flies', 'nocturnal', 'night', 'echolocation', 'wings', 'cave'] },
  ],
  landmarks: [
    { name: 'Eiffel Tower', aliases: ['la tour eiffel'], facts: ['paris', 'france', 'europe', 'tower', 'iron', 'metal', 'tall', 'built in the 1800s', 'man made'] },
    { name: 'Great Wall of China', aliases: ['great wall'], facts: ['china', 'asia', 'wall', 'long', 'stone', 'ancient', 'man made', 'mountains'] },
    { name: 'Statue of Liberty', aliases: ['lady liberty'], facts: ['new york', 'united states', 'america', 'statue', 'copper', 'green', 'torch', 'island', 'man made'] },
    { name: 'Colosseum', aliases: ['roman colosseum', 'colosseo'], facts: ['rome', 'italy', 'europe', 'ancient', 'arena', 'stone', 'gladiators', 'man made'] },
    { name: 'Taj Mahal', aliases: [], facts: ['india', 'asia', 'marble', 'white', 'mausoleum', 'domes', 'man made', 'river'] },
    { name: 'Sydney Opera House', aliases: [], facts: ['australia', 'sydney', 'harbor', 'sails', 'concert hall', 'modern', 'man made', 'water'] },
    { name: 'Big Ben', aliases: ['elizabeth tower'], facts: ['london', 'england', 'europe', 'clock', 'tower', 'bell', 'river', 'man made'] },
    { name: 'Mount Everest', aliases: ['everest'], facts: ['nepal', 'himalayas', 'asia', 'mountain', 'tallest', 'snow', 'natural', 'climbing'] },
    { name: 'Grand Canyon', aliases: [], facts: ['united states', 'america', 'arizona', 'canyon', 'river', 'rock', 'natural', 'deep'] },
    { name: 'Niagara Falls', aliases: [], facts: ['canada', 'united states', 'waterfall', 'water', 'natural', 'river', 'border'] },
    { name: 'Great Pyramid of Giza', aliases: ['pyramid of khufu', 'great pyramid'], facts: ['egypt', 'africa', 'pyramid', 'ancient', 'stone', 'desert', 'pharaoh', 'man made'] },
    { name: 'Golden Gate Bridge', aliases: [], facts: ['san francisco', 'united states', 'america', 'bridge', 'red', 'orange', 'steel', 'bay', 'man made'] },
    { name: 'Leaning Tower of Pisa', aliases: [], facts: ['italy', 'europe', 'tower', 'leans', 'tilted', 'bell', 'marble', 'man made'] },
    { name: 'Christ the Redeemer', aliases: ['cristo redentor'], facts: ['brazil', 'rio de janeiro', 'south america', 'statue', 'mountain', 'arms', 'man made'] },
    { name: 'Mount Fuji', aliases: ['fujisan'], facts: ['japan', 'asia', 'mountain', 'volcano', 'snow', 'natural', 'sacred'] },
    { name: 'Stonehenge', aliases: [], facts: ['england', 'europe', 'stones', 'circle', 'ancient', 'prehistoric', 'man made', 'mystery'] },
  ],
  foods: [
    { name: 'pizza', aliases: [], facts: ['italian', 'italy', 'baked', 'cheese', 'dough', 'tomato', 'oven', 'savory', 'round'] },
    { name: 'sushi', aliases: [], facts: ['japanese', 'japan', 'rice', 'fish', 'raw', 'seaweed', 'rolls'] },
    { name: 'chocolate', aliases: [], facts: ['sweet', 'cacao', 'cocoa', 'dessert', 'brown', 'candy', 'melts'] },
    { name: 'hamburger', aliases: ['burger'], facts: ['beef', 'bun', 'grilled', 'fast food', 'american', 'savory', 'patty'] },
    { name: 'ice cream', aliases: ['icecream'], facts: ['sweet', 'cold', 'frozen', 'dessert', 'dairy', 'cone', 'scoop'] },
    { name: 'spaghetti', aliases: ['pasta'], facts: ['italian', 'italy', 'noodles', 'long', 'boiled', 'sauce', 'wheat'] },
    { name: 'banana', aliases: [], facts: ['fruit', 'yellow', 'peel', 'sweet', 'tropical', 'potassium', 'grows on trees'] },
    { name: 'cheese', aliases: [], facts: ['dairy', 'milk', 'yellow', 'aged', 'fermented', 'savory', 'melts'] },
    { name: 'coffee', aliases: [], facts: ['drink', 'beverage', 'caffeine', 'beans', 'bitter', 'hot', 'brewed', 'brown'] },
    { name: 'popcorn', aliases: [], facts: ['corn', 'snack', 'popped', 'salty', 'movies', 'light', 'butter'] },
    { name: 'avocado', aliases: [], facts: ['fruit', 'green', 'pit', 'seed', 'guacamole', 'creamy', 'toast'] },
    { name: 'pancakes', aliases: ['pancake'], facts: ['breakfast', 'flat', 'batter', 'griddle', 'syrup', 'stack', 'sweet'] },
    { name: 'taco', aliases: ['tacos'], facts: ['mexican', 'mexico', 'tortilla', 'folded', 'filling', 'savory', 'handheld'] },
    { name: 'watermelon', aliases: [], facts: ['fruit', 'melon', 'red inside', 'seeds', 'summer', 'juicy', 'green rind', 'sweet'] },
    { name: 'french fries', aliases: ['fries', 'chips'], facts: ['potato', 'fried', 'salty', 'fast food', 'sticks', 'ketchup', 'side dish'] },
    { name: 'honey', aliases: [], facts: ['sweet', 'bees', 'golden', 'liquid', 'natural', 'syrup like', 'hive'] },
  ],
  inventions: [
    { name: 'light bulb', aliases: ['lightbulb', 'incandescent bulb'], facts: ['electric', 'light', 'edison', 'glass', 'filament', 'illumination', '1800s'] },
    { name: 'telephone', aliases: ['phone'], facts: ['communication', 'calls', 'voice', 'bell', 'wires', 'electric', '1800s'] },
    { name: 'airplane', aliases: ['aeroplane', 'plane'], facts: ['flies', 'flight', 'wright brothers', 'wings', 'engine', 'transport', '1900s'] },
    { name: 'wheel', aliases: [], facts: ['ancient', 'round', 'rolls', 'transport', 'axle', 'simple machine', 'prehistoric'] },
    { name: 'printing press', aliases: [], facts: ['books', 'gutenberg', 'paper', 'ink', 'movable type', '1400s', 'reading'] },
    { name: 'internet', aliases: ['world wide web', 'the web'], facts: ['network', 'computers', 'global', 'digital', 'communication', '1900s', 'online'] },
    { name: 'television', aliases: ['tv'], facts: ['screen', 'broadcast', 'shows', 'electric', 'entertainment', '1900s', 'video'] },
    { name: 'refrigerator', aliases: ['fridge'], facts: ['cold', 'food storage', 'kitchen', 'appliance', 'electric', 'cooling'] },
    { name: 'bicycle', aliases: ['bike'], facts: ['two wheels', 'pedals', 'human powered', 'transport', 'ride', 'chain'] },
    { name: 'camera', aliases: [], facts: ['photos', 'pictures', 'lens', 'light', 'images', 'film', 'digital'] },
    { name: 'computer', aliases: [], facts: ['digital', 'electronic', 'processing', 'software', 'screen', 'calculation', '1900s'] },
    { name: 'microwave oven', aliases: ['microwave'], facts: ['heats food', 'kitchen', 'appliance', 'waves', 'fast cooking', 'electric'] },
    { name: 'automobile', aliases: ['car'], facts: ['transport', 'engine', 'four wheels', 'drives', 'roads', 'fuel', '1900s'] },
    { name: 'clock', aliases: ['mechanical clock'], facts: ['time', 'hours', 'hands', 'ticking', 'measures time', 'ancient'] },
    { name: 'vaccines', aliases: ['vaccine', 'vaccination'], facts: ['medicine', 'disease', 'immunity', 'health', 'injection', 'prevention', 'medical'] },
    { name: 'steam engine', aliases: [], facts: ['steam', 'industrial revolution', 'trains', 'power', 'coal', '1700s', 'pistons'] },
  ],
  space: [
    { name: 'the Moon', aliases: ['moon', 'luna'], facts: ['earth satellite', 'natural satellite', 'orbits earth', 'craters', 'night sky', 'phases', 'rocky'] },
    { name: 'Mars', aliases: ['red planet'], facts: ['planet', 'red', 'rocky', 'solar system', 'rovers', 'fourth from the sun', 'dust'] },
    { name: 'Jupiter', aliases: [], facts: ['planet', 'gas giant', 'largest', 'solar system', 'great red spot', 'many moons'] },
    { name: 'Saturn', aliases: [], facts: ['planet', 'rings', 'gas giant', 'solar system', 'second largest'] },
    { name: 'black hole', aliases: [], facts: ['gravity', 'event horizon', 'collapsed star', 'light cannot escape', 'dense', 'singularity'] },
    { name: 'the Sun', aliases: ['sun', 'sol'], facts: ['star', 'solar system center', 'hot', 'fusion', 'light', 'plasma'] },
    { name: 'International Space Station', aliases: ['iss', 'space station'], facts: ['orbits earth', 'astronauts', 'man made', 'laboratory', 'low earth orbit', 'solar panels'] },
    { name: 'Hubble Space Telescope', aliases: ['hubble'], facts: ['telescope', 'orbits earth', 'man made', 'images', 'observatory', 'launched 1990'] },
    { name: 'Milky Way', aliases: ['milky way galaxy'], facts: ['galaxy', 'our galaxy', 'spiral', 'billions of stars', 'home'] },
    { name: 'comet', aliases: [], facts: ['ice', 'tail', 'orbit', 'solar system', 'dirty snowball', 'periodic'] },
    { name: 'asteroid', aliases: [], facts: ['rocky', 'small', 'belt', 'solar system', 'orbit', 'metal'] },
    { name: 'Venus', aliases: [], facts: ['planet', 'hottest', 'thick atmosphere', 'second from the sun', 'rocky', 'bright'] },
    { name: 'Neptune', aliases: [], facts: ['planet', 'blue', 'ice giant', 'farthest', 'windy', 'solar system'] },
    { name: 'supernova', aliases: [], facts: ['exploding star', 'explosion', 'bright', 'death of a star', 'remnant'] },
    { name: 'the Andromeda Galaxy', aliases: ['andromeda'], facts: ['galaxy', 'neighbor', 'spiral', 'visible to naked eye', 'billions of stars'] },
    { name: 'a lunar eclipse', aliases: ['lunar eclipse'], facts: ['moon', 'earth shadow', 'alignment', 'night', 'red moon', 'event'] },
  ],
};

export function themeNames() {
  return Object.keys(THEMES);
}

export function pickConcept(theme, rng = Math.random) {
  const list = THEMES[theme];
  return list[Math.floor(rng() * list.length)];
}

export function normalizeGuess(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

export function localMatch(concept, guess) {
  const g = normalizeGuess(guess);
  if (!g) return false;
  const names = [concept.name, ...(concept.aliases || [])].map(normalizeGuess);
  if (names.includes(g)) return true;
  // simple plural tolerance
  return names.some((n) => n === g + 's' || n + 's' === g);
}

// Deterministic local fallback used when the model GM is unreachable
// or returns unusable output twice. Keyword based, never reveals more
// than a plain yes or no.
export function fallbackAnswer(concept, question) {
  const q = ' ' + String(question || '').toLowerCase() + ' ';
  const names = [concept.name, ...(concept.aliases || [])].map((n) => n.toLowerCase());
  if (names.some((n) => q.includes(n))) return 'yes';
  const facts = (concept.facts || []).map((f) => f.toLowerCase());
  if (facts.some((f) => q.includes(f))) return 'yes';
  // a few generic category words mapped from facts
  return 'no';
}

export function scoreFor(questionsUsed, wrongGuesses) {
  return Math.max(5, (MAX_QUESTIONS + 1 - questionsUsed) * 10 - wrongGuesses * 15);
}

export class GameStore {
  constructor(filePath) {
    this.filePath = filePath || null;
    this.games = new Map();
    this.leaderboard = [];
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      for (const g of data.games || []) this.games.set(g.id, g);
      this.leaderboard = data.leaderboard || [];
    } catch {
      // missing or corrupt file: start fresh
    }
  }

  save() {
    if (!this.filePath) return;
    const data = {
      games: [...this.games.values()],
      leaderboard: this.leaderboard,
    };
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  createGame({ theme, player, concept }) {
    const id = crypto.randomBytes(6).toString('hex');
    const game = {
      id,
      player: String(player || 'anonymous').slice(0, 40),
      theme,
      secret: concept,
      questions: [],
      wrongGuesses: [],
      status: 'playing',
      createdAt: new Date().toISOString(),
      finishedAt: null,
      score: null,
    };
    this.games.set(id, game);
    this.save();
    return game;
  }

  getGame(id) {
    return this.games.get(String(id || ''));
  }

  finishGame(game, won) {
    game.status = won ? 'won' : 'lost';
    game.finishedAt = new Date().toISOString();
    if (won) {
      game.score = scoreFor(game.questions.length, game.wrongGuesses.length);
      this.leaderboard.push({
        player: game.player,
        theme: game.theme,
        questionsUsed: game.questions.length,
        wrongGuesses: game.wrongGuesses.length,
        score: game.score,
        finishedAt: game.finishedAt,
      });
      this.leaderboard.sort(
        (a, b) => b.score - a.score || a.questionsUsed - b.questionsUsed
      );
      this.leaderboard = this.leaderboard.slice(0, 100);
    }
    this.save();
    return game;
  }

  topLeaderboard(n = 10) {
    return this.leaderboard.slice(0, n);
  }
}

// Public view of a game. The secret is only included once the game is over.
export function publicState(game) {
  const out = {
    game_id: game.id,
    player: game.player,
    theme: game.theme,
    status: game.status,
    questions_used: game.questions.length,
    questions_left: MAX_QUESTIONS - game.questions.length,
    wrong_guesses: game.wrongGuesses,
    guesses_left: MAX_WRONG_GUESSES - game.wrongGuesses.length,
    history: game.questions,
  };
  if (game.status !== 'playing') {
    out.secret = game.secret.name;
    out.score = game.score;
  }
  return out;
}
