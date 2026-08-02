// Adaptadores Firebase(arc_rules.json) → shapes locais dos apps (NPC Catalog / GM Screen).
// Funções PURAS e testadas. Os HTMLs incluem uma cópia fiel destas (como Ponte.gs faz com parser.js).

// Fórmula do Doc ("10 + 5d4 + 5*Corpo", "5 > 7 > 10 > 15") → estilo de exibição do NPC.
function normFormula(s) {
  if (s == null) return s;
  return String(s).replace(/\*/g, '×').replace(/\s*>\s*/g, '→').replace(/\s*\+\s*/g, '+').trim();
}

// Skill Firebase {name,action,cost,desc,lb?} → skill local {n,a,c,d,lb?}
function mapSkill(s) {
  const o = { n: s.name, a: s.action || '', c: s.cost == null ? null : s.cost, d: s.desc || '' };
  if (s.lb) o.lb = true;
  return o;
}

// Classe Firebase → entrada CL do NPC (sem estrelas; aplique preserveStars depois).
function mapClass(c) {
  const o = { tipo: c.type === 'especifica' ? 'e' : 'g', sk: (c.skills || []).map(mapSkill), ult: null };
  if (c.natureza) o.nat = c.natureza;
  if (c.ultimate) {
    const u = c.ultimate;
    o.ult = { n: u.name, a: u.action || '', c: u.cost == null ? null : u.cost, d: u.desc || '' };
    if (u.limit) o.ult.lim = u.limit;
  }
  return o;
}

// Natureza Firebase → campos a sobrepor em NATURE_DATA[nat] (nunca inclui caBase; só campos presentes).
function mapNature(nat) {
  const o = {};
  if (nat.buff != null) o.buff = nat.buff;
  if (nat.debuff != null) o.debuff = nat.debuff;
  if (nat.habUnica) {
    const h = nat.habUnica;
    o.habUnica = { n: h.name, a: h.action || '', c: h.cost == null ? null : h.cost, d: h.desc || '' };
  }
  if (nat.hpBase != null) o.hpF = normFormula(nat.hpBase);
  if (nat.hpNivel != null) o.hpL = normFormula(nat.hpNivel);
  if (nat.staBase != null) o.staF = normFormula(nat.staBase);
  if (nat.staNivel != null) o.staL = normFormula(nat.staNivel);
  if (nat.staRec != null) o.staRec = normFormula(nat.staRec);
  return o;
}

// Seção de efeitos {items:[{name}]} → array de nomes (ou null se vazio/ausente).
function effectNames(section) {
  if (!section || !Array.isArray(section.items)) return null;
  const names = section.items.map(function (i) { return i.name; }).filter(Boolean);
  return names.length ? names : null;
}

// Copia estrelas de cálculo das skills antigas p/ as novas de MESMO nome.
// Devolve { skills, lostStars }: lostStars = nomes com estrela que sumiram (skill renomeada no Doc).
const STAR_KEYS = ['hpB', 'caB', 'movB', 'sanB'];
function preserveStars(oldSkills, newSkills) {
  const byName = {};
  (newSkills || []).forEach(function (s) { byName[s.n] = s; });
  const lostStars = [];
  (oldSkills || []).forEach(function (o) {
    const stars = STAR_KEYS.filter(function (k) { return o[k] != null; });
    if (!stars.length) return;
    const match = byName[o.n];
    if (match) stars.forEach(function (k) { match[k] = o[k]; });
    else lostStars.push(o.n);
  });
  return { skills: newSkills || [], lostStars: lostStars };
}

module.exports = { normFormula, mapSkill, mapClass, mapNature, effectNames, preserveStars };
