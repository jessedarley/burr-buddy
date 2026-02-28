import crypto from 'node:crypto'

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const FRIENDLY_SUFFIX_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const FOUR_LETTER_WORDS = [
  'able', 'acid', 'aged', 'also', 'area', 'army', 'away', 'baby', 'back', 'ball',
  'band', 'bank', 'base', 'bath', 'bear', 'beat', 'been', 'bell', 'belt', 'best',
  'bill', 'bird', 'blow', 'blue', 'boat', 'body', 'book', 'born', 'both', 'bowl',
  'bulk', 'burn', 'bush', 'busy', 'call', 'calm', 'came', 'camp', 'card', 'care',
  'case', 'cash', 'cell', 'chat', 'city', 'club', 'coal', 'coat', 'code', 'cold',
  'come', 'cook', 'cool', 'copy', 'core', 'cost', 'crew', 'crop', 'dark', 'data',
  'date', 'dawn', 'days', 'deal', 'dean', 'deep', 'desk', 'dial', 'diet', 'disk',
  'does', 'done', 'door', 'down', 'draw', 'drew', 'drop', 'drug', 'dual', 'duty',
  'each', 'earn', 'ease', 'east', 'easy', 'edge', 'else', 'even', 'ever', 'exam',
  'face', 'fact', 'fair', 'fall', 'farm', 'fast', 'fate', 'fear', 'feed', 'feel',
  'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm',
  'fish', 'five', 'flat', 'flow', 'food', 'foot', 'ford', 'form', 'fort', 'four',
  'free', 'from', 'fuel', 'full', 'fund', 'gain', 'game', 'gate', 'gave', 'gear',
  'gene', 'gift', 'girl', 'give', 'glad', 'goal', 'goes', 'gold', 'golf', 'gone',
  'good', 'gray', 'grew', 'grow', 'half', 'hall', 'hand', 'hang', 'hard', 'harm',
  'hate', 'have', 'head', 'hear', 'heat', 'held', 'hell', 'help', 'here', 'hero',
  'high', 'hill', 'hire', 'hold', 'hole', 'holy', 'home', 'hope', 'host', 'hour',
  'huge', 'hung', 'hunt', 'idea', 'inch', 'into', 'iron', 'item', 'jazz', 'join',
  'jump', 'keep', 'kent', 'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew',
  'know', 'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late', 'lead',
  'left', 'less', 'life', 'lift', 'like', 'line', 'link', 'list', 'live', 'load',
  'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love',
  'luck', 'made', 'mail', 'main', 'make', 'male', 'many', 'mark', 'mass', 'math',
  'meal', 'mean', 'meat', 'meet', 'menu', 'mere', 'mild', 'mile', 'milk', 'mind',
  'mine', 'miss', 'mode', 'more', 'most', 'move', 'much', 'must', 'name', 'navy',
  'near', 'neck', 'need', 'news', 'next', 'nice', 'nick', 'nine', 'none', 'nose',
  'note', 'okay', 'once', 'only', 'onto', 'open', 'oral', 'over', 'pace', 'pack',
  'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'pass', 'past', 'path',
  'peak', 'pick', 'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poll',
  'pool', 'poor', 'port', 'post', 'pull', 'pure', 'push', 'race', 'rain', 'rank',
  'rate', 'read', 'real', 'rear', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride',
  'ring', 'rise', 'risk', 'road', 'rock', 'role', 'roll', 'roof', 'room', 'root',
  'rose', 'rule', 'rush', 'safe', 'said', 'sake', 'sale', 'salt', 'same', 'sand',
  'save', 'seat', 'seed', 'seek', 'seem', 'seen', 'self', 'sell', 'send', 'sent',
  'ship', 'shop', 'show', 'shut', 'sick', 'side', 'sign', 'site', 'size', 'skin',
  'slip', 'slow', 'snow', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon',
  'sort', 'soul', 'spot', 'star', 'stay', 'step', 'stop', 'such', 'suit', 'sure',
  'take', 'tale', 'talk', 'tall', 'tank', 'task', 'team', 'tech', 'tell', 'tend',
  'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this',
  'thus', 'till', 'time', 'tiny', 'told', 'tone', 'tool', 'tour', 'town', 'tree',
  'trip', 'true', 'tune', 'turn', 'type', 'unit', 'upon', 'used', 'user', 'uses',
  'vast', 'very', 'view', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want',
  'ward', 'warm', 'wash', 'wave', 'ways', 'weak', 'wear', 'week', 'well', 'went',
  'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind',
  'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wood', 'word', 'wore', 'work',
  'yard', 'yeah', 'year', 'your', 'zero', 'zone',
]

export function generateRandomBase62Token(length = 16) {
  const chars = []
  while (chars.length < length) {
    const bytes = crypto.randomBytes(length)
    for (const value of bytes) {
      if (value < 248) {
        chars.push(BASE62[value % 62])
        if (chars.length === length) break
      }
    }
  }
  return chars.join('')
}

function randomChars(alphabet, length) {
  const chars = []
  while (chars.length < length) {
    const bytes = crypto.randomBytes(length)
    for (const value of bytes) {
      if (value < Math.floor(256 / alphabet.length) * alphabet.length) {
        chars.push(alphabet[value % alphabet.length])
        if (chars.length === length) break
      }
    }
  }
  return chars.join('')
}

function randomWord() {
  const index = crypto.randomInt(FOUR_LETTER_WORDS.length)
  return FOUR_LETTER_WORDS[index]
}

export function generateFriendlyToken() {
  const words = [randomWord(), randomWord(), randomWord()]
  const suffix = randomChars(FRIENDLY_SUFFIX_ALPHABET, 6)
  return `${words.join('-')}-${suffix}`
}
