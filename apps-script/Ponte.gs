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

// Lê o que JÁ está publicado no Firebase (para comparar). Devolve {} em qualquer falha.
function buscarRegrasAtuais() {
  try {
    const r = UrlFetchApp.fetch(FB_RULES_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return {};
    const d = JSON.parse(r.getContentText() || 'null');
    return (d && d.classes) ? d.classes : {};
  } catch (e) { return {}; }
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _previewHtml(out, diff) {
  let head = '<div class="hd">Classes lidas: <b>' + out.count + '</b> (esperado 14)</div>';
  if (out.warnings.length) {
    head += '<div class="warn">⚠️ ' + out.warnings.length + ' aviso(s):<ul>';
    out.warnings.forEach(function (w) { head += '<li>' + _esc(w) + '</li>'; });
    head += '</ul></div>';
  } else {
    head += '<div class="ok">✓ Nenhum aviso de leitura.</div>';
  }
  let body;
  if (!diff.hasChanges) {
    body = '<div class="nochg">✓ Nenhuma mudança em relação ao que já está publicado no Firebase.</div>';
  } else {
    let rows = '';
    diff.rows.forEach(function (r) {
      rows += '<tr class="path"><td colspan="2">' + _esc(r.path) + ' <span class="tag ' + r.type + '">' + r.type + '</span></td></tr>';
      if (r.type === 'modified') {
        rows += '<tr><td class="old">' + _esc(r.old) + '</td><td class="new">' + _esc(r.new) + '</td></tr>';
      } else if (r.type === 'class-added' || r.type === 'skill-added') {
        rows += '<tr><td class="muted">—</td><td class="new">' + _esc(r.new) + '</td></tr>';
      } else {
        rows += '<tr><td class="old">' + _esc(r.old) + '</td><td class="muted">—</td></tr>';
      }
    });
    body = '<div class="hd">Mudanças desde a última publicação (' + diff.rows.length + '):</div>'
      + '<table><tr><th>Atual (Firebase)</th><th>Novo (Doc)</th></tr>' + rows + '</table>';
  }
  const css = '<style>'
    + 'body{font:13px/1.45 system-ui,Arial,sans-serif;margin:0;padding:12px;color:#24292e}'
    + '.hd{font-weight:600;margin:10px 0 6px}'
    + '.ok{color:#22863a;margin:6px 0}.warn{color:#9a6700;margin:6px 0}.warn ul{margin:4px 0 0 18px}'
    + '.nochg{color:#22863a;padding:10px;background:#f0fff4;border:1px solid #bef5cb;border-radius:6px}'
    + 'table{border-collapse:collapse;width:100%;table-layout:fixed}'
    + 'th,td{border:1px solid #e1e4e8;padding:6px 8px;vertical-align:top;text-align:left;width:50%;word-wrap:break-word;white-space:pre-wrap}'
    + 'th{background:#f6f8fa}.path td{background:#f6f8fa;font-weight:600}'
    + '.old{background:#ffeef0}.new{background:#e6ffed}.muted{color:#999}'
    + '.tag{font-weight:400;font-size:11px;color:#fff;border-radius:3px;padding:1px 5px;margin-left:6px}'
    + '.tag.modified{background:#9a6700}.tag.skill-added,.tag.class-added{background:#22863a}'
    + '.tag.skill-removed,.tag.class-removed{background:#d73a49}'
    + '</style>';
  return css + head + body;
}

function mostrarPreview() {
  const out = construirArcRules();
  const diff = diffClasses(buscarRegrasAtuais(), out.rules.classes);
  const html = HtmlService.createHtmlOutput(_previewHtml(out, diff)).setWidth(840).setHeight(580);
  DocumentApp.getUi().showModalDialog(html, 'Preview — Ponte ARC');
}

function publicar() {
  const ui = DocumentApp.getUi();
  const out = construirArcRules();
  const diff = diffClasses(buscarRegrasAtuais(), out.rules.classes);
  const resumo = diff.hasChanges ? (diff.rows.length + ' mudança(s)') : 'nenhuma mudança';
  const aviso = out.warnings.length ? ('\n\n⚠️ ' + out.warnings.length + ' aviso(s)! Veja o Preview antes.') : '';
  const resp = ui.alert('Publicar no Firebase',
    'Enviar ' + out.count + ' classes (' + resumo + ') para o ARC?\nUse "Pré-visualizar" para ver o diff lado a lado.' + aviso,
    ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;
  const r = UrlFetchApp.fetch(FB_RULES_URL, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(out.rules), muteHttpExceptions: true,
  });
  ui.alert(r.getResponseCode() === 200 ? 'Publicado com sucesso ✓' : ('Erro ' + r.getResponseCode() + ': ' + r.getContentText()));
}
