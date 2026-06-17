// ============================================================================
// Ponte ARC — Google Apps Script
// Cole este arquivo no editor de Apps Script do Doc "Sistema Intitulados"
// (Extensões > Apps Script). Adiciona o menu "Ponte ARC" para pré-visualizar e
// publicar as Classes no Firebase, de onde o ARC_System_V2.html lê.
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
  return { classes: classes, warnings: warnings };
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

function coletarParagrafos() {
  return DocumentApp.getActiveDocument().getBody().getParagraphs()
    .map(function (p) { return { heading: _headingName(p.getHeading()), text: p.getText() }; });
}

function construirArcRules() {
  const r = parseClasses(coletarParagrafos());
  return {
    rules: { _version: 1, _updatedAt: new Date().getTime(), classes: r.classes },
    warnings: r.warnings,
    count: Object.keys(r.classes).length,
  };
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
  const linhas = ['Classes lidas: ' + out.count + ' (esperado 14)', ''];
  Object.keys(out.rules.classes).forEach(function (k) {
    const c = out.rules.classes[k];
    linhas.push('• ' + k + ' [' + c.type + (c.natureza ? '/' + c.natureza : '') + '] — ' +
      c.skills.length + ' skills' + (c.ultimate ? ' + ultimate' : ' (SEM ULTIMATE)'));
  });
  if (out.warnings.length) {
    linhas.push('', '⚠️ AVISOS (' + out.warnings.length + '):');
    out.warnings.forEach(function (w) { linhas.push('  - ' + w); });
  } else {
    linhas.push('', '✓ Nenhum aviso.');
  }
  const safe = linhas.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = HtmlService
    .createHtmlOutput('<pre style="white-space:pre-wrap;font:13px monospace">' + safe + '</pre>')
    .setWidth(640).setHeight(460);
  DocumentApp.getUi().showModalDialog(html, 'Preview — Ponte ARC');
}

function publicar() {
  const ui = DocumentApp.getUi();
  const out = construirArcRules();
  const aviso = out.warnings.length ? ('\n\n⚠️ ' + out.warnings.length + ' aviso(s)! Veja o Preview antes.') : '';
  const resp = ui.alert('Publicar no Firebase', 'Enviar ' + out.count + ' classes para o ARC?' + aviso, ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;
  const r = UrlFetchApp.fetch(FB_RULES_URL, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(out.rules), muteHttpExceptions: true,
  });
  ui.alert(r.getResponseCode() === 200 ? 'Publicado com sucesso ✓' : ('Erro ' + r.getResponseCode() + ': ' + r.getContentText()));
}
