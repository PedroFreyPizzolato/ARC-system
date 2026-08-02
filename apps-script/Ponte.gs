// ============================================================================
// Ponte ARC — Google Apps Script
// Cole este arquivo no editor de Apps Script do Doc "Sistema Intitulados"
// (Extensões > Apps Script). Menu "Ponte ARC" para pré-visualizar e publicar
// Classes + Habilidades de subatributo no Firebase, de onde o ARC lê.
//
// As funções puras abaixo são CÓPIA FIEL de tools/rules-parser/parser.js
// (a fonte de verdade, coberta por testes). Se mudar uma, mude nas duas.
// ============================================================================

// ---- INÍCIO cópia de tools/rules-parser/parser.js ----
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
    .map(function (g) { return g.replace(/^[([]|[)\]]$/g, '').trim(); })
    .filter(Boolean);
  let limit = null, cost = null, action = null;
  for (const g of groups) {
    if (/por\s+(luta|cena|miss|rodada)|x\s*por|vez/i.test(g)) { limit = g; }
    else if (/\d\s*s/i.test(g) || /x\s*\*/i.test(g)) { cost = normalizeCost(g); }
    else { action = normalizeAction(g).value; }
  }
  return { name: name, action: action || 'Especial', cost: cost, limit: limit };
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
    // Campos granulares (mesmos dados, separados) p/ apps que montam suas próprias strings (ex.: NPC Catalog).
    if (a.vida0) o.hpBase = a.vida0;
    if (a.vidaN) o.hpNivel = a.vidaN;
    if (a.stamina0) o.staBase = a.stamina0;
    if (a.staminaN) o.staNivel = a.staminaN;
    if (a.staR) o.staRec = a.staR;
    if (o.hp || o.sta) natures[n] = o;
  });
  return { natures: natures, warnings: warnings };
}

const NAT_BUFF_RE = /^buff\s*:\s*(.+)$/i;
const NAT_DEBUFF_RE = /^debuff\s*:\s*(.+)$/i;
const NAT_HAB_LABEL_RE = /^habilidade\s*[úu]nica\s*:\s*(.*)$/i;

// Buff/debuff/habilidade única por natureza (seção "# Naturezas").
// Buff/debuff são strings; a habilidade única é a linha em formato de skill
// (Nome (ação) [custo]: desc) dentro do bloco da natureza — com ou sem o rótulo
// "Habilidade única:" antes dela.
function parseNatures(paragraphs) {
  const acc = {};
  const warnings = [];
  let inNat = false, currentNat = null;
  function ensure(n) { if (!acc[n]) acc[n] = {}; return acc[n]; }
  function setHab(line) {
    const sk = parseSkillLine(line);
    if (!sk) return false;
    if (!sk.actionKnown) warnings.push('Natureza "' + currentNat + '": ação não reconhecida na hab. única → "' + sk.action + '"');
    ensure(currentNat).habUnica = { name: sk.name, action: sk.action, cost: sk.cost, desc: sk.desc };
    return true;
  }
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inNat = /^naturezas$/i.test(full.trim()); currentNat = null; continue; }
    if (!inNat) continue;
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      let m;
      if ((m = t.match(NAT_BUFF_RE))) { if (currentNat) ensure(currentNat).buff = m[1].trim(); continue; }
      if ((m = t.match(NAT_DEBUFF_RE))) { if (currentNat) ensure(currentNat).debuff = m[1].trim(); continue; }
      if ((m = t.match(NAT_HAB_LABEL_RE))) { const rest = (m[1] || '').trim(); if (rest && currentNat) setHab(rest); continue; }
      const nat = _natureKey(t);
      if (nat) { currentNat = nat; continue; }
      if (currentNat) setHab(t); // qualquer linha em formato de skill vira a hab. única
    }
  }
  Object.keys(acc).forEach(function (n) {
    if (!acc[n].habUnica) warnings.push('Natureza "' + n + '": habilidade única não reconhecida (use o formato Nome (ação) [custo]: desc)');
  });
  return { natures: acc, warnings: warnings };
}
// Seção "# Sistemas e Esclarecimentos": blocos rotulados por parágrafo simples
// (Distâncias, DoT, Idades, ...). Cada bloco vira { intro, items:[{name,desc,note?}] }.
// Itens no formato "Nome: descrição"; linhas soltas antes do 1º item = intro,
// depois do 1º item = note do último item. Combos/Coberturas/Ficha são ignorados.
const SYS_SECTIONS = {
  'distancias': 'distancias',
  'efeitos negativos': 'efeitosNegativos',
  'efeitos positivos': 'efeitosPositivos',
  'dot': 'dot',
  'duas armas': 'duasArmas',
  'critico': 'critico',
  'categorias de dano e reducao': 'categoriasDano',
  'tipos de dano': 'tiposDano',
  'chance': 'chance',
  'arredondamentos': 'arredondamentos',
  // reconhecidos mas ignorados (conteúdo não entra no ARC nem vaza p/ a seção anterior)
  'ca': null, 'idades': null, 'combos': null, 'coberturas': null, 'ficha': null,
};
function _norm(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
const SYS_ITEM_RE = /^([^:]{1,60}):\s*(.+)$/;

function parseSystems(paragraphs) {
  const systems = {};
  const warnings = [];
  let inSystems = false, key = undefined, item = null;
  function ensure(k) { if (!systems[k]) systems[k] = { intro: null, items: [] }; return systems[k]; }
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inSystems = _norm(full) === 'sistemas e esclarecimentos'; key = undefined; item = null; continue; }
    if (!inSystems) continue;
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      const n = _norm(t);
      if (Object.prototype.hasOwnProperty.call(SYS_SECTIONS, n)) { key = SYS_SECTIONS[n]; item = null; continue; }
      if (!key) continue; // fora de seção conhecida ou seção ignorada
      const sec = ensure(key);
      const m = t.match(SYS_ITEM_RE);
      if (m) { item = { name: m[1].trim(), desc: m[2].trim() }; sec.items.push(item); }
      else if (item) { item.note = (item.note ? item.note + ' ' : '') + t; }
      else { sec.intro = (sec.intro ? sec.intro + ' ' : '') + t; }
    }
  }
  return { systems: systems, warnings: warnings };
}

// Seção "# Ações": descrição "Ofensiva VS. Defensiva" (topo do painel) + 3 colunas
// rotuladas (Ofensivas, Defensivas, Inspiradoras), cada uma { intro, items:[{name,cost,desc}], note }.
const ACT_SECTIONS = {
  'ofensiva vs. defensiva': 'desc', 'ofensiva vs defensiva': 'desc',
  'ofensivas': 'ofensivas', 'defensivas': 'defensivas', 'inspiradoras': 'inspiradoras',
};
const ACT_COL_KEYS = ['ofensivas', 'defensivas', 'inspiradoras'];
const ACT_ITEM_RE = /^(.{1,40}?)(?:\s*\(([^)]+)\))?:\s*(.+)$/;
const ACT_NOTE_RE = /custam\s+\d+\s*s|m[áa]ximo de \d+ pontos de inspira/i;

function parseActions(paragraphs) {
  const columns = {
    ofensivas: { intro: null, items: [], note: null },
    defensivas: { intro: null, items: [], note: null },
    inspiradoras: { intro: null, items: [], note: null },
  };
  const actions = { desc: '', columns: columns };
  const warnings = [];
  let inActions = false, mode = undefined, item = null;
  for (const p of paragraphs) {
    const heading = p.heading || 'NORMAL';
    const full = String(p.text || '');
    if (heading === 'HEADING1') { inActions = _norm(full) === 'acoes'; mode = undefined; item = null; continue; }
    if (!inActions) continue;
    for (const raw of full.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      const n = _norm(t);
      if (Object.prototype.hasOwnProperty.call(ACT_SECTIONS, n)) { mode = ACT_SECTIONS[n]; item = null; continue; }
      if (mode === 'desc') { actions.desc = (actions.desc ? actions.desc + ' ' : '') + t; continue; }
      if (ACT_COL_KEYS.indexOf(mode) < 0) continue; // intro/Obs antes das colunas: ignora
      const col = columns[mode];
      if (ACT_NOTE_RE.test(t) && t.indexOf(':') < 0) { col.note = t; item = null; continue; }
      const m = t.match(ACT_ITEM_RE);
      if (m) { item = { name: m[1].trim(), cost: (m[2] || '').trim() || null, desc: m[3].trim() }; col.items.push(item); }
      else if (item) { item.desc += ' ' + t; }
      else { col.intro = (col.intro ? col.intro + ' ' : '') + t; }
    }
  }
  return { actions: actions, warnings: warnings };
}
// ---- FIM cópia de tools/rules-parser/parser.js ----

// ---- Camada Google (I/O): lê o Doc, mostra preview, grava no Firebase ----
const FB_RULES_URL = 'https://intitulations-default-rtdb.firebaseio.com/arc_rules.json';

function _headingName(h) {
  const H = DocumentApp.ParagraphHeading;
  if (h === H.HEADING1) return 'HEADING1';
  if (h === H.HEADING2) return 'HEADING2';
  if (h === H.HEADING3) return 'HEADING3';
  return 'NORMAL';
}

// Inclui PARAGRAPH e LIST_ITEM (as skills de subatributo estão em listas), na ordem do Doc.
function coletarParagrafos() {
  const body = DocumentApp.getActiveDocument().getBody();
  const ET = DocumentApp.ElementType;
  const out = [];
  const n = body.getNumChildren();
  for (let i = 0; i < n; i++) {
    const el = body.getChild(i);
    const type = el.getType();
    let p = null;
    if (type === ET.PARAGRAPH) p = el.asParagraph();
    else if (type === ET.LIST_ITEM) p = el.asListItem();
    if (p) out.push({ heading: _headingName(p.getHeading()), text: p.getText() });
  }
  return out;
}

function construirArcRules() {
  const paras = coletarParagrafos();
  const c = parseClasses(paras);
  const s = parseSubattrs(paras);
  const st = parseStatus(paras);
  const nt = parseNatures(paras);
  const sy = parseSystems(paras);
  const ac = parseActions(paras);
  // Mescla buff/debuff/habUnica (# Naturezas) no mesmo nó de cada natureza (hp/sta vêm de # Status).
  Object.keys(nt.natures).forEach(function (n) {
    const dst = st.natures[n] || (st.natures[n] = {}), src = nt.natures[n];
    if (src.buff) dst.buff = src.buff;
    if (src.debuff) dst.debuff = src.debuff;
    if (src.habUnica) dst.habUnica = src.habUnica;
  });
  return {
    rules: { _version: 1, _updatedAt: new Date().getTime(), classes: c.classes, subattrs: s.subattrs, status: { natures: st.natures }, systems: sy.systems, actions: ac.actions },
    warnings: c.warnings.concat(s.warnings).concat(st.warnings).concat(nt.warnings).concat(sy.warnings).concat(ac.warnings),
    countClasses: Object.keys(c.classes).length,
    countSubattrs: Object.keys(s.subattrs).length,
    countNatures: Object.keys(st.natures).length,
    countSystems: Object.keys(sy.systems).length,
    countActions: ACT_COL_KEYS.reduce(function (acc, k) { return acc + (ac.actions.columns[k].items || []).length; }, 0),
  };
}

function buscarRegrasAtuais() {
  try {
    const r = UrlFetchApp.fetch(FB_RULES_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return {};
    return JSON.parse(r.getContentText() || 'null') || {};
  } catch (e) { return {}; }
}

// Envelopa subattrs {chave:[skills]} como {chave:{skills,ultimate}} para reusar diffClasses.
function _envelope(subattrs) {
  const o = {};
  Object.keys(subattrs || {}).forEach(function (k) { o[k] = { skills: subattrs[k], ultimate: null }; });
  return o;
}

// Envelopa systems {secao:{intro,items}} como pseudo-classes (intro + itens como "skills") p/ reusar diffClasses.
function _envSystems(systems) {
  const o = {};
  Object.keys(systems || {}).forEach(function (k) {
    const sec = systems[k], skills = [];
    if (sec.intro) skills.push({ name: '(intro)', action: '', cost: null, desc: sec.intro });
    (sec.items || []).forEach(function (it) {
      skills.push({ name: it.name, action: '', cost: null, desc: it.desc + (it.note ? ' | ' + it.note : '') });
    });
    o[k] = { skills: skills, ultimate: null };
  });
  return o;
}

// Envelopa actions {desc,columns} como pseudo-classes (descrição + colunas) p/ reusar diffClasses.
function _envActions(actions) {
  actions = actions || {};
  const o = {};
  const dSk = [];
  if (actions.desc) dSk.push({ name: '(Ofensiva VS. Defensiva)', action: '', cost: null, desc: actions.desc });
  o['Ações — descrição'] = { skills: dSk, ultimate: null };
  const cols = actions.columns || {};
  ['ofensivas', 'defensivas', 'inspiradoras'].forEach(function (k) {
    const c = cols[k] || {}, sk = [];
    if (c.intro) sk.push({ name: '(intro)', action: '', cost: null, desc: c.intro });
    (c.items || []).forEach(function (it) { sk.push({ name: it.name, action: '', cost: it.cost || null, desc: it.desc }); });
    if (c.note) sk.push({ name: '(nota)', action: '', cost: null, desc: c.note });
    o['Ações — ' + k] = { skills: sk, ultimate: null };
  });
  return o;
}

// Envelopa status {natureza:{hp,sta}} como pseudo-classes (Vida/Stamina como "skills") p/ reusar diffClasses.
function _envStatus(natures) {
  const o = {};
  Object.keys(natures || {}).forEach(function (n) {
    const s = natures[n], skills = [];
    if (s.hp) skills.push({ name: 'Vida', action: '', cost: null, desc: s.hp });
    if (s.sta) skills.push({ name: 'Stamina', action: '', cost: null, desc: s.sta });
    if (s.buff) skills.push({ name: 'Buff', action: '', cost: null, desc: s.buff });
    if (s.debuff) skills.push({ name: 'Debuff', action: '', cost: null, desc: s.debuff });
    if (s.habUnica) skills.push({ name: 'Hab. Única', action: s.habUnica.action, cost: s.habUnica.cost, desc: s.habUnica.name + ' — ' + s.habUnica.desc });
    o[n] = { skills: skills, ultimate: null };
  });
  return o;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _diffSection(titulo, diff) {
  if (!diff.hasChanges) return '<div class="hd">' + titulo + '</div><div class="nochg">✓ Sem mudanças.</div>';
  let rows = '';
  diff.rows.forEach(function (r) {
    rows += '<tr class="path"><td colspan="2">' + _esc(r.path) + ' <span class="tag ' + r.type + '">' + r.type + '</span></td></tr>';
    if (r.type === 'modified') rows += '<tr><td class="old">' + _esc(r.old) + '</td><td class="new">' + _esc(r.new) + '</td></tr>';
    else if (r.type === 'class-added' || r.type === 'skill-added') rows += '<tr><td class="muted">—</td><td class="new">' + _esc(r.new) + '</td></tr>';
    else rows += '<tr><td class="old">' + _esc(r.old) + '</td><td class="muted">—</td></tr>';
  });
  return '<div class="hd">' + titulo + ' (' + diff.rows.length + ')</div>'
    + '<table><tr><th>Atual (Firebase)</th><th>Novo (Doc)</th></tr>' + rows + '</table>';
}

function _previewHtml(out, diffCls, diffSub, diffSt, diffSy, diffAc) {
  let head = '<div class="hd">Classes: <b>' + out.countClasses + '</b> (14) · Subatributos: <b>' + out.countSubattrs + '</b> (8) · Naturezas Vida/Sta: <b>' + out.countNatures + '</b> (4) · Sistemas: <b>' + out.countSystems + '</b> · Ações: <b>' + out.countActions + '</b></div>';
  if (out.warnings.length) {
    head += '<div class="warn">⚠️ ' + out.warnings.length + ' aviso(s):<ul>';
    out.warnings.forEach(function (w) { head += '<li>' + _esc(w) + '</li>'; });
    head += '</ul></div>';
  } else { head += '<div class="ok">✓ Nenhum aviso de leitura.</div>'; }
  const css = '<style>'
    + 'body{font:13px/1.45 system-ui,Arial,sans-serif;margin:0;padding:12px;color:#24292e}'
    + '.hd{font-weight:600;margin:12px 0 6px}'
    + '.ok{color:#22863a;margin:6px 0}.warn{color:#9a6700;margin:6px 0}.warn ul{margin:4px 0 0 18px}'
    + '.nochg{color:#22863a;padding:8px;background:#f0fff4;border:1px solid #bef5cb;border-radius:6px}'
    + 'table{border-collapse:collapse;width:100%;table-layout:fixed}'
    + 'th,td{border:1px solid #e1e4e8;padding:6px 8px;vertical-align:top;text-align:left;width:50%;word-wrap:break-word;white-space:pre-wrap}'
    + 'th{background:#f6f8fa}.path td{background:#f6f8fa;font-weight:600}'
    + '.old{background:#ffeef0}.new{background:#e6ffed}.muted{color:#999}'
    + '.tag{font-weight:400;font-size:11px;color:#fff;border-radius:3px;padding:1px 5px;margin-left:6px}'
    + '.tag.modified{background:#9a6700}.tag.skill-added,.tag.class-added{background:#22863a}'
    + '.tag.skill-removed,.tag.class-removed{background:#d73a49}'
    + '</style>';
  return css + head + _diffSection('Classes', diffCls) + _diffSection('Subatributos', diffSub) + _diffSection('Status (Vida/Stamina)', diffSt) + _diffSection('Sistemas e Esclarecimentos', diffSy) + _diffSection('Ações', diffAc);
}

function onOpen() {
  DocumentApp.getUi().createMenu('Ponte ARC')
    .addItem('Pré-visualizar', 'mostrarPreview')
    .addSeparator()
    .addItem('Publicar no Firebase', 'publicar')
    .addToUi();
}

function mostrarPreview() {
  const out = construirArcRules();
  const atual = buscarRegrasAtuais();
  const diffCls = diffClasses(atual.classes, out.rules.classes);
  const diffSub = diffClasses(_envelope(atual.subattrs), _envelope(out.rules.subattrs));
  const diffSt = diffClasses(_envStatus(atual.status && atual.status.natures), _envStatus(out.rules.status.natures));
  const diffSy = diffClasses(_envSystems(atual.systems), _envSystems(out.rules.systems));
  const diffAc = diffClasses(_envActions(atual.actions), _envActions(out.rules.actions));
  const html = HtmlService.createHtmlOutput(_previewHtml(out, diffCls, diffSub, diffSt, diffSy, diffAc)).setWidth(860).setHeight(620);
  DocumentApp.getUi().showModalDialog(html, 'Preview — Ponte ARC');
}

function publicar() {
  const ui = DocumentApp.getUi();
  const out = construirArcRules();
  const atual = buscarRegrasAtuais();
  const nMud = diffClasses(atual.classes, out.rules.classes).rows.length
    + diffClasses(_envelope(atual.subattrs), _envelope(out.rules.subattrs)).rows.length
    + diffClasses(_envStatus(atual.status && atual.status.natures), _envStatus(out.rules.status.natures)).rows.length
    + diffClasses(_envSystems(atual.systems), _envSystems(out.rules.systems)).rows.length
    + diffClasses(_envActions(atual.actions), _envActions(out.rules.actions)).rows.length;
  const aviso = out.warnings.length ? ('\n\n⚠️ ' + out.warnings.length + ' aviso(s)! Veja o Preview antes.') : '';
  const resp = ui.alert('Publicar no Firebase',
    'Enviar ' + out.countClasses + ' classes + ' + out.countSubattrs + ' subatributos + ' + out.countNatures + ' naturezas + ' + out.countSystems + ' sistemas + ' + out.countActions + ' ações (' + nMud + ' mudança(s)) para o ARC?'
    + '\nUse "Pré-visualizar" para ver o diff lado a lado.' + aviso,
    ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;
  const r = UrlFetchApp.fetch(FB_RULES_URL, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(out.rules), muteHttpExceptions: true,
  });
  ui.alert(r.getResponseCode() === 200 ? 'Publicado com sucesso ✓' : ('Erro ' + r.getResponseCode() + ': ' + r.getContentText()));
}
