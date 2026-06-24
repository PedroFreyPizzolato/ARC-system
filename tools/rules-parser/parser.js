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
  const base = String(raw).split('->')[0].split('/')[0]
    .toLowerCase().replace(/\s*\+\s*/g, ' + ').replace(/\s+/g, ' ').trim();
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

const NATUREZAS = ['Brutamontes', 'Guerreiro', 'Atleta', 'Velocista'];

function parseClasses(paragraphs) {
  const classes = {};
  const warnings = [];
  let inClasses = false, mode = null, currentNatureza = null, currentClass = null, pendingUlt = null;

  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const t = String(p.text || '').trim();

    if (heading === 'HEADING1') {
      inClasses = /^classes$/i.test(t);
      mode = null; currentNatureza = null; currentClass = null; pendingUlt = null;
      continue;
    }
    if (!inClasses) continue;

    if (heading === 'HEADING3') {
      if (/classes\s+gerais/i.test(t)) { mode = 'geral'; currentClass = null; pendingUlt = null; continue; }
      if (/classes\s+espec/i.test(t)) { mode = 'especifica'; currentClass = null; pendingUlt = null; continue; }
      if (mode === 'especifica' && t) {
        currentClass = t;
        classes[t] = { type: 'especifica', natureza: currentNatureza, skills: [], ultimate: null };
        pendingUlt = null;
      }
      continue;
    }

    if (heading === 'HEADING2') {
      if (mode === 'especifica' && NATUREZAS.indexOf(t) >= 0) {
        currentNatureza = t; currentClass = null; pendingUlt = null; continue;
      }
      if (t) {
        currentClass = t;
        classes[t] = { type: 'geral', skills: [], ultimate: null };
        pendingUlt = null;
      }
      continue;
    }

    // NORMAL
    if (!t || !currentClass) continue;

    if (pendingUlt) {
      classes[currentClass].ultimate = Object.assign({}, pendingUlt, { desc: t });
      pendingUlt = null;
      continue;
    }
    if (/^\s*["“”'‘’]/.test(t)) {
      const u = parseUltimateHeader(t);
      if (u) { pendingUlt = u; continue; }
    }
    const sk = parseSkillLine(t);
    if (sk) {
      if (!sk.actionKnown) warnings.push('Classe "' + currentClass + '": ação não reconhecida em "' + sk.name + '" → "' + sk.action + '"');
      classes[currentClass].skills.push({ name: sk.name, action: sk.action, cost: sk.cost, desc: sk.desc });
      continue;
    }
    if (/^[^()]{1,80}\([^)]*\)/.test(t) || /–\s*\(/.test(t)) {
      warnings.push('Classe "' + currentClass + '": linha não reconhecida → "' + t.slice(0, 70) + '"');
    }
  }
  return { classes, warnings };
}

const SUBATTR_KEYS = ['forca', 'vigor', 'agilidade', 'habilidade', 'sincronia', 'intelecto', 'conexao', 'entendimento'];
function _subKey(text) {
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return SUBATTR_KEYS.indexOf(t) >= 0 ? t : null;
}
const NIVEL_RE = /^n[íi]vel\s+\d+\s*[—–-]\s*(.+)$/i;

// Skills de subatributo: seção "# Atributos", subatributos como parágrafos (nome conhecido),
// skills em listas com prefixo "Nível N —", "Limit break" marca lb.
function parseSubattrs(paragraphs) {
  const subattrs = {};
  const warnings = [];
  let inAttrs = false, currentSub = null, lbMode = false;
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inAttrs = /^atributos$/i.test(full.trim()); currentSub = null; lbMode = false; continue; }
    if (!inAttrs) continue;
    if (heading === 'HEADING2') { currentSub = null; lbMode = false; continue; }
    // um item pode conter várias linhas (quebra de linha interna no Doc) — processa cada uma
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      const sub = _subKey(t);
      if (sub) { currentSub = sub; lbMode = false; if (!subattrs[sub]) subattrs[sub] = []; continue; }
      if (/^limit\s*break$/i.test(t)) { lbMode = true; continue; }
      const m = t.match(NIVEL_RE);
      if (m && currentSub) {
        const sk = parseSkillLine(m[1]);
        if (sk) {
          const skill = { name: sk.name, action: sk.action, cost: sk.cost, desc: sk.desc };
          if (lbMode) { skill.lb = true; skill.desc = '[LB] ' + skill.desc; }
          if (!sk.actionKnown) warnings.push('Subatributo "' + currentSub + '": ação não reconhecida em "' + sk.name + '"');
          subattrs[currentSub].push(skill);
        } else {
          warnings.push('Subatributo "' + currentSub + '": linha não reconhecida → "' + t.slice(0, 70) + '"');
        }
      }
    }
  }
  return { subattrs: subattrs, warnings: warnings };
}

function _fmtSkill(s) {
  return s.name + ' (' + s.action + (s.cost ? ' ' + s.cost : '') + '): ' + (s.desc || '');
}
function _skillMap(list) {
  const m = {};
  (list || []).forEach(function (s) { m[s.name] = s; });
  return m;
}
function _cmpFields(prefix, a, b, fields, rows) {
  fields.forEach(function (f) {
    const av = a[f] == null ? '' : String(a[f]);
    const bv = b[f] == null ? '' : String(b[f]);
    if (av !== bv) rows.push({ path: prefix + ' › ' + f, type: 'modified', old: av || '—', new: bv || '—' });
  });
}

// Compara dois objetos `classes` (antigo vs novo) e devolve linhas de diff lado a lado.
function diffClasses(oldC, newC) {
  oldC = oldC || {};
  newC = newC || {};
  const rows = [];
  Object.keys(oldC).forEach(function (n) {
    if (!(n in newC)) rows.push({ path: n, type: 'class-removed', old: 'classe inteira', new: '' });
  });
  Object.keys(newC).forEach(function (n) {
    if (!(n in oldC)) rows.push({ path: n, type: 'class-added', old: '', new: 'classe nova (' + ((newC[n].skills || []).length) + ' skills)' });
  });
  Object.keys(newC).forEach(function (n) {
    if (!(n in oldC)) return;
    const a = oldC[n], b = newC[n];
    if ((a.type || '') !== (b.type || '')) rows.push({ path: n + ' › tipo', type: 'modified', old: a.type || '—', new: b.type || '—' });
    if ((a.natureza || '') !== (b.natureza || '')) rows.push({ path: n + ' › natureza', type: 'modified', old: a.natureza || '—', new: b.natureza || '—' });
    const om = _skillMap(a.skills), nm = _skillMap(b.skills);
    Object.keys(om).forEach(function (name) {
      if (!(name in nm)) rows.push({ path: n + ' › ' + name, type: 'skill-removed', old: _fmtSkill(om[name]), new: '' });
    });
    Object.keys(nm).forEach(function (name) {
      if (!(name in om)) { rows.push({ path: n + ' › ' + name, type: 'skill-added', old: '', new: _fmtSkill(nm[name]) }); return; }
      _cmpFields(n + ' › ' + name, om[name], nm[name], ['action', 'cost', 'desc'], rows);
    });
    const ao = a.ultimate, bo = b.ultimate;
    if (!ao && bo) rows.push({ path: n + ' › ULT ' + bo.name, type: 'skill-added', old: '', new: _fmtSkill(bo) });
    else if (ao && !bo) rows.push({ path: n + ' › ULT ' + ao.name, type: 'skill-removed', old: _fmtSkill(ao), new: '' });
    else if (ao && bo) _cmpFields(n + ' › ULT', ao, bo, ['name', 'action', 'cost', 'limit', 'desc'], rows);
  });
  return { hasChanges: rows.length > 0, rows: rows };
}

const NATURE_NAMES = { 'brutamonte': 'Brutamontes', 'brutamontes': 'Brutamontes', 'guerreiro': 'Guerreiro', 'atleta': 'Atleta', 'velocista': 'Velocista' };
function _natureKey(text) {
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return NATURE_NAMES[t] || null;
}
const N0_RE = /^n[íi]vel\s*0\s*:\s*(.+)$/i;
const PN_RE = /^por\s*n[íi]vel\s*:\s*(.+)$/i;
const REC_RE = /^recupera[çc][ãa]o\s*:\s*(.+)$/i;

// Vida/Stamina por natureza (seção "# Status") → strings hp/sta exibidas no ARC.
function parseStatus(paragraphs) {
  const acc = {};
  const warnings = [];
  let inStatus = false, mode = null, currentNat = null;
  function ensure(n) { if (!acc[n]) acc[n] = {}; return acc[n]; }
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inStatus = /^status$/i.test(full.trim()); mode = null; currentNat = null; continue; }
    if (!inStatus) continue;
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      if (/^vida$/i.test(t)) { mode = 'vida'; currentNat = null; continue; }
      if (/^stamina$/i.test(t)) { mode = 'stamina'; currentNat = null; continue; }
      if (/^sanidade$/i.test(t)) { mode = 'sanidade'; currentNat = null; continue; }
      const nat = _natureKey(t);
      if (nat) { currentNat = nat; continue; }
      if (!currentNat || !mode || mode === 'sanidade') continue;
      let m;
      if ((m = t.match(N0_RE))) ensure(currentNat)[mode + '0'] = m[1].trim();
      else if ((m = t.match(PN_RE))) ensure(currentNat)[mode + 'N'] = m[1].trim();
      else if (mode === 'stamina' && (m = t.match(REC_RE))) ensure(currentNat).staR = m[1].trim();
    }
  }
  const natures = {};
  Object.keys(acc).forEach(function (n) {
    const a = acc[n], o = {};
    if (a.vida0) o.hp = a.vida0 + (a.vidaN ? ' | Por nível: ' + a.vidaN : '');
    if (a.stamina0) o.sta = a.stamina0 + (a.staminaN ? ' | Por nível: ' + a.staminaN : '') + (a.staR ? ' | Rec: ' + a.staR : '');
    if (o.hp || o.sta) natures[n] = o;
  });
  return { natures: natures, warnings: warnings };
}

const NAT_BUFF_RE = /^buff\s*:\s*(.+)$/i;
const NAT_DEBUFF_RE = /^debuff\s*:\s*(.+)$/i;
const NAT_HAB_RE = /^habilidade\s*[úu]nica\s*:\s*(.*)$/i;

// Buff/debuff/habilidade única por natureza (seção "# Naturezas").
// Buff/debuff são strings; a habilidade única vem no formato de skill (Nome (ação) [custo]: desc).
function parseNatures(paragraphs) {
  const acc = {};
  const warnings = [];
  let inNat = false, currentNat = null, expectHab = false;
  function ensure(n) { if (!acc[n]) acc[n] = {}; return acc[n]; }
  function setHab(line) {
    if (!currentNat) return;
    const sk = parseSkillLine(line);
    if (!sk) { warnings.push('Natureza "' + currentNat + '": habilidade única não reconhecida → "' + line.slice(0, 60) + '"'); return; }
    if (!sk.actionKnown) warnings.push('Natureza "' + currentNat + '": ação não reconhecida na hab. única → "' + sk.action + '"');
    ensure(currentNat).habUnica = { name: sk.name, action: sk.action, cost: sk.cost, desc: sk.desc };
  }
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inNat = /^naturezas$/i.test(full.trim()); currentNat = null; expectHab = false; continue; }
    if (!inNat) continue;
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      let m;
      if ((m = t.match(NAT_BUFF_RE))) { if (currentNat) ensure(currentNat).buff = m[1].trim(); expectHab = false; continue; }
      if ((m = t.match(NAT_DEBUFF_RE))) { if (currentNat) ensure(currentNat).debuff = m[1].trim(); expectHab = false; continue; }
      if ((m = t.match(NAT_HAB_RE))) {
        const rest = (m[1] || '').trim();
        if (rest) { setHab(rest); expectHab = false; } else expectHab = true;
        continue;
      }
      const nat = _natureKey(t);
      if (nat) { currentNat = nat; expectHab = false; continue; }
      if (expectHab) { setHab(t); expectHab = false; continue; }
    }
  }
  return { natures: acc, warnings: warnings };
}

module.exports = { normalizeAction, normalizeCost, parseSkillLine, parseUltimateHeader, parseClasses, diffClasses, parseSubattrs, parseStatus, parseNatures };
