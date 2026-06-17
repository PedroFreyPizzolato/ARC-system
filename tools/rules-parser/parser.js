const ACTION_MAP = {
  'passiva': 'Passiva', 'padrão': 'Padrão', 'bônus': 'Bônus', 'movimento': 'Movimento',
  'reação': 'Reação', 'livre': 'Livre', 'completo': 'Completa', 'completa': 'Completa',
  'fala': 'Fala', 'especial': 'Especial', 'coringa': 'Coringa',
  'reação + bônus': 'Reação+Bônus', 'padrão + bônus': 'Padrão+Bônus',
  'padrão + movimento': 'Padrão+Movimento', 'reação + movimento': 'Movimento+Reação',
  'movimento + reação': 'Movimento+Reação', 'bônus + movimento': 'Bônus+Movimento',
};

function normalizeAction(raw) {
  if (!raw) return { value: 'Especial', known: false };
  const base = String(raw).split('->')[0].toLowerCase().replace(/\s+/g, ' ').trim();
  if (ACTION_MAP[base]) return { value: ACTION_MAP[base], known: true };
  return { value: String(raw).trim(), known: false };
}

function normalizeCost(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/\s*->\s*/g, '+').trim();
  return s.length ? s : null;
}

const SKILL_RE = /^(.+?)\s*\(([^)]+)\)(?:\s*\[([^\]]+)\])?:\s*(.+)$/;

function parseSkillLine(text) {
  const t = String(text || '').trim();
  const m = t.match(SKILL_RE);
  if (!m) return null;
  const act = normalizeAction(m[2]);
  return {
    name: m[1].trim(),
    action: act.value,
    actionKnown: act.known,
    cost: normalizeCost(m[3]),
    desc: m[4].trim(),
  };
}

const QUOTES = '"“”\'‘’';
const NAME_RE = new RegExp('^\\s*[' + QUOTES + ']([^' + QUOTES + ']+)[' + QUOTES + ']');

function parseUltimateHeader(text) {
  const t = String(text || '').trim();
  const nm = t.match(NAME_RE);
  if (!nm) return null;
  const name = nm[1].trim();
  const rest = t.slice(nm[0].length);
  const groups = (rest.match(/\(([^)]*)\)|\[([^\]]*)\]/g) || [])
    .map(g => g.replace(/^[([]|[)\]]$/g, '').trim())
    .filter(Boolean);
  let limit = null, cost = null, action = null;
  for (const g of groups) {
    if (/por\s+(luta|cena|miss|rodada)|x\s*por|vez/i.test(g)) { limit = g; }
    else if (/\d\s*s/i.test(g) || /x\s*\*/i.test(g)) { cost = normalizeCost(g); }
    else { action = normalizeAction(g).value; }
  }
  return { name, action: action || 'Especial', cost: cost, limit: limit };
}

module.exports = { normalizeAction, normalizeCost, parseSkillLine, parseUltimateHeader };
