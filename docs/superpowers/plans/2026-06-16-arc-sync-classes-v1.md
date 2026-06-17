# Sincronização de Classes (Doc → Firebase → ARC) — Plano de Implementação V1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O autor edita as **Classes** no Google Doc "Sistema Intitulados" e, com um clique em "Publicar", as mudanças aparecem na ficha do player (`ARC_System_V2.html`) sem editar HTML nem reenviar arquivo.

**Architecture:** Uma "ponte" em Google Apps Script (vinculada ao Doc) lê o Doc por seções, traduz cada skill no formato `Nome (ação) [custo]: descrição` para o objeto `CLASS_DATA` do ARC, mostra um preview e grava em `/arc_rules` no Firebase Realtime Database via REST PUT. O `ARC_System_V2.html` ganha um *loader* que, no boot, lê `/arc_rules` via `fetch` REST (funciona em `file://`), com fallback para cache (`localStorage`) e depois para os dados embutidos.

**Tech Stack:** JavaScript puro (parser), Node.js 18+ (`node:test` para testes do parser e do loader — zero dependências externas), Google Apps Script (`DocumentApp`, `UrlFetchApp`, `HtmlService`), Firebase Realtime Database REST.

## Global Constraints

- **Escopo V1 = só `ARC_System_V2.html`.** Confirmado por pesquisa que é o único dos 3 HTMLs que usa `CLASS_DATA`. NÃO tocar em `ARC_GM_Screen_V2.html` nem `ARC_NPC_Catalog_V2.html`.
- **Nunca quebrar o offline.** O ARC deve continuar funcionando aberto por `file://` sem internet. Fallback obrigatório: Firebase → cache `localStorage` → dados embutidos.
- **Mudanças cirúrgicas no HTML.** Tocar apenas: a declaração de `CLASS_DATA` (linha 2613) e a função `init()` (linhas 2804-2813). Nenhum dos 11 usos de `CLASS_DATA` deve precisar mudar.
- **Firebase existente:** banco `intitulations`, URL REST `https://intitulations-default-rtdb.firebaseio.com`. Nó novo: `/arc_rules`. Não mexer em `/arc_campaigns` (sync de fichas).
- **Parser puro e isolado:** toda a lógica de tradução fica em funções puras (sem APIs de Apps Script) para ser testável em Node. O `.gs` contém uma cópia dessas funções + a camada de I/O. Fonte de verdade dos testes: `tools/rules-parser/parser.js`.
- **Valores de `action` válidos** (ARC `ACTIONS_LIST`): `Passiva, Padrão, Bônus, Movimento, Reação, Livre, Completa, Fala, Coringa, Padrão+Bônus, Padrão+Movimento, Reação+Bônus, Movimento+Reação, Bônus+Movimento, Padrão+Bônus+Movimento, Especial`.
- **14 classes esperadas:** 6 gerais (Sobrevivente, Combatente, Tático, Operador Técnico, Explorador, Infiltrador) + 8 específicas (Titã, Aniquilador → Brutamontes; Gladiador, Exterminador → Guerreiro; Corredor de linha, Lutador → Atleta; Batedor Cinético, Predador → Velocista).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `tools/rules-parser/parser.js` | Funções puras: `normalizeAction`, `normalizeCost`, `parseSkillLine`, `parseUltimateHeader`, `parseClasses`. Fonte de verdade. |
| `tools/rules-parser/fixtures.js` | Parágrafos de exemplo (casos reais do Doc) usados nos testes. |
| `tools/rules-parser/parser.test.js` | Testes `node:test` do parser. |
| `tools/loader/resolve.js` + `resolve.test.js` | Função pura `resolveClassData(remote, cached, embedded)` + testes. |
| `apps-script/Ponte.gs` | Cópia das funções puras + camada `DocumentApp` (coletar parágrafos) + menu + preview + PUT Firebase. Cola-se no editor de Apps Script do Doc. |
| `apps-script/README.md` | Passo a passo de instalação no Doc + regras do Firebase. |
| `ARC_System_V2.html` | MODIFICAR: `CLASS_DATA` mutável + `loadClassData()` no `init`. |

---

### Task 1: Setup do parser + `normalizeAction` / `normalizeCost`

**Files:**
- Create: `tools/rules-parser/parser.js`
- Test: `tools/rules-parser/parser.test.js`

**Interfaces:**
- Produces: `normalizeAction(raw) → { value: string, known: boolean }`; `normalizeCost(raw) → string|null`. Exportados via `module.exports`.

- [ ] **Step 1: Write the failing test**

```js
// tools/rules-parser/parser.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeAction, normalizeCost } = require('./parser');

test('normalizeAction mapeia valores simples do Doc para o ARC', () => {
  assert.deepEqual(normalizeAction('passiva'), { value: 'Passiva', known: true });
  assert.deepEqual(normalizeAction('completo'), { value: 'Completa', known: true });
  assert.deepEqual(normalizeAction('bônus'), { value: 'Bônus', known: true });
});

test('normalizeAction mapeia combinações e ordena como o ARC', () => {
  assert.deepEqual(normalizeAction('reação + bônus'), { value: 'Reação+Bônus', known: true });
  assert.deepEqual(normalizeAction('reação + movimento'), { value: 'Movimento+Reação', known: true });
});

test('normalizeAction usa a parte antes da seta (completo -> fala)', () => {
  assert.deepEqual(normalizeAction('completo -> fala'), { value: 'Completa', known: true });
});

test('normalizeAction marca known=false para valor desconhecido', () => {
  assert.equal(normalizeAction('teleporte mágico').known, false);
});

test('normalizeCost troca seta por + e preserva o resto', () => {
  assert.equal(normalizeCost('5S'), '5S');
  assert.equal(normalizeCost('1S -> 8S'), '1S+8S');
  assert.equal(normalizeCost(null), null);
  assert.equal(normalizeCost(undefined), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: FAIL com "Cannot find module './parser'".

- [ ] **Step 3: Write minimal implementation**

```js
// tools/rules-parser/parser.js
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

module.exports = { normalizeAction, normalizeCost };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add tools/rules-parser/parser.js tools/rules-parser/parser.test.js
git commit -m "feat(parser): normalizeAction e normalizeCost com testes"
```

---

### Task 2: `parseSkillLine`

**Files:**
- Modify: `tools/rules-parser/parser.js`
- Test: `tools/rules-parser/parser.test.js`

**Interfaces:**
- Consumes: `normalizeAction`, `normalizeCost`.
- Produces: `parseSkillLine(text) → { name, action, actionKnown, cost, desc }|null`. Retorna `null` quando a linha não casa o padrão `Nome (ação) [custo]: descrição` (sinaliza "não reconhecida" ao orquestrador).

- [ ] **Step 1: Write the failing test**

```js
// adicionar em parser.test.js
const { parseSkillLine } = require('./parser');

test('parseSkillLine: passiva sem custo', () => {
  const r = parseSkillLine('Instinto de Preservação (passiva): Após sofrer Dano Massivo...');
  assert.equal(r.name, 'Instinto de Preservação');
  assert.equal(r.action, 'Passiva');
  assert.equal(r.cost, null);
  assert.equal(r.desc, 'Após sofrer Dano Massivo...');
});

test('parseSkillLine: ação + custo', () => {
  const r = parseSkillLine('Improvisador Nato (completo) [5S]: Você pode improvisar uma arma.');
  assert.equal(r.name, 'Improvisador Nato');
  assert.equal(r.action, 'Completa');
  assert.equal(r.cost, '5S');
  assert.equal(r.desc, 'Você pode improvisar uma arma.');
});

test('parseSkillLine: custo e ação com seta', () => {
  const r = parseSkillLine('Plano de Contingência (completo -> fala) [1S -> 8S]: Uma vez por luta...');
  assert.equal(r.name, 'Plano de Contingência');
  assert.equal(r.action, 'Completa');
  assert.equal(r.cost, '1S+8S');
});

test('parseSkillLine: descrição com dois-pontos interno fica intacta', () => {
  const r = parseSkillLine('Olhos no Alvo (especial) [2S]: alvo não some: vantagem e crítico -2.');
  assert.equal(r.cost, '2S');
  assert.equal(r.desc, 'alvo não some: vantagem e crítico -2.');
});

test('parseSkillLine: linha malformada (travessão, sem dois-pontos) retorna null', () => {
  assert.equal(parseSkillLine('Aceleração Tática – (5S) Próximo turno todas as ações dobradas'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: FAIL com "parseSkillLine is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// adicionar em parser.js (antes do module.exports)
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
```

Atualizar o `module.exports`:
```js
module.exports = { normalizeAction, normalizeCost, parseSkillLine };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add tools/rules-parser/parser.js tools/rules-parser/parser.test.js
git commit -m "feat(parser): parseSkillLine com testes (incl. setas e malformados)"
```

---

### Task 3: `parseUltimateHeader`

**Files:**
- Modify: `tools/rules-parser/parser.js`
- Test: `tools/rules-parser/parser.test.js`

**Interfaces:**
- Consumes: `normalizeAction`, `normalizeCost`.
- Produces: `parseUltimateHeader(text) → { name, action, cost, limit }|null`. `action` cai para `'Especial'` quando o Doc não traz grupo de ação. Retorna `null` se a linha não começa por aspas / não tem nome entre aspas.

- [ ] **Step 1: Write the failing test**

```js
// adicionar em parser.test.js
const { parseUltimateHeader } = require('./parser');

test('ultimate com limite e ação explícita (sem custo)', () => {
  const r = parseUltimateHeader('"Espírito Indomável" (1x por cena) (passiva):');
  assert.equal(r.name, 'Espírito Indomável');
  assert.equal(r.limit, '1x por cena');
  assert.equal(r.action, 'Passiva');
  assert.equal(r.cost, null);
});

test('ultimate com limite e custo em colchetes, ação implícita = Especial', () => {
  const r = parseUltimateHeader('"Tempestade de Aço" (1x por luta) [20S]:');
  assert.equal(r.name, 'Tempestade de Aço');
  assert.equal(r.limit, '1x por luta');
  assert.equal(r.cost, '20S');
  assert.equal(r.action, 'Especial');
});

test('ultimate com custo em parênteses', () => {
  const r = parseUltimateHeader('"Bastião" (1x por luta) (15S):');
  assert.equal(r.cost, '15S');
  assert.equal(r.limit, '1x por luta');
});

test('ultimate com custo multiplicador X*3S', () => {
  const r = parseUltimateHeader('"Fim do Combate" (1x por missão) (X*3S):');
  assert.equal(r.cost, 'X*3S');
  assert.equal(r.limit, '1x por missão');
});

test('linha sem aspas não é ultimate', () => {
  assert.equal(parseUltimateHeader('Foco no Alvo (passiva): +1 de dano'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: FAIL com "parseUltimateHeader is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// adicionar em parser.js
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
```

Atualizar `module.exports` para incluir `parseUltimateHeader`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: PASS (15 testes).

- [ ] **Step 5: Commit**

```bash
git add tools/rules-parser/parser.js tools/rules-parser/parser.test.js
git commit -m "feat(parser): parseUltimateHeader com testes (limite/custo/X*3S)"
```

---

### Task 4: `parseClasses` (orquestrador + warnings)

**Files:**
- Modify: `tools/rules-parser/parser.js`
- Create: `tools/rules-parser/fixtures.js`
- Test: `tools/rules-parser/parser.test.js`

**Interfaces:**
- Consumes: `parseSkillLine`, `parseUltimateHeader`.
- Produces: `parseClasses(paragraphs) → { classes: Object, warnings: string[] }`, onde `paragraphs` é `[{ heading: 'HEADING1'|'HEADING2'|'HEADING3'|'NORMAL', text: string }]` e `classes` espelha o `CLASS_DATA` do ARC: `{ [nome]: { type:'geral'|'especifica', natureza?:string, skills:[{name,action,cost,desc}], ultimate:{name,action,cost,limit,desc}|null } }`.

- [ ] **Step 1: Write the failing test (com fixtures reais do Doc)**

```js
// tools/rules-parser/fixtures.js
// Recorte real do Doc (já como texto plano, igual ao que Apps Script.getText() devolve).
const N = (text) => ({ heading: 'NORMAL', text });
const H1 = (text) => ({ heading: 'HEADING1', text });
const H2 = (text) => ({ heading: 'HEADING2', text });
const H3 = (text) => ({ heading: 'HEADING3', text });

const SAMPLE = [
  H1('Classes'),
  N('Nível 1 só é possível escolher classes gerais...'),
  H3('Classes Gerais'),
  H2('Sobrevivente'),
  N('Instinto de Preservação (passiva): Após sofrer Dano Massivo pela primeira vez na cena, você além de resistir com 1 de vida, não tem um membro destruído'),
  N('Improvisador Nato (completo) [5S]: Você pode improvisar uma arma.'),
  N('Rastreador (bônus) [3S]: Teste de investigação com vantagem.'),
  N('Adaptação Rápida (passiva): Após receber um DoT pela terceira vez na cena resiste.'),
  N('Força do Desespero (passiva): Com menos de 33% da vida, +2 em força ou agilidade.'),
  N('"Espírito Indomável" (1x por cena) (passiva):'),
  N('Quando reduzido a 0 de vida pela primeira vez você se levanta com 33% da vida.'),
  H3('Classes Específicas'),
  H2('Brutamontes'),
  H3('Titã'),
  N('Pele de aço (passiva): Sua redução de dano aumenta 50%.'),
  N('Muralha viva (reação + movimento) [5S]: Entra na frente do ataque por um aliado.'),
  N('Pés firmes (passiva): Imune a controle de grupo.'),
  N('Recuperação rápida (passiva): Cura 10% por turno sem ser atacado.'),
  N('Imposição física (livre) [6S]: Inimigos com menos Corpo ficam amedrontados.'),
  N('"Bastião" (1x por luta) (15S):'),
  N('Por 3 rodadas você fica imóvel e ganha 90% de redução.'),
];

module.exports = { SAMPLE };
```

```js
// adicionar em parser.test.js
const { parseClasses } = require('./parser');
const { SAMPLE } = require('./fixtures');

test('parseClasses extrai classe geral com 5 skills + ultimate', () => {
  const { classes } = parseClasses(SAMPLE);
  const s = classes['Sobrevivente'];
  assert.equal(s.type, 'geral');
  assert.equal(s.skills.length, 5);
  assert.equal(s.skills[0].name, 'Instinto de Preservação');
  assert.equal(s.ultimate.name, 'Espírito Indomável');
  assert.equal(s.ultimate.limit, '1x por cena');
  assert.equal(s.ultimate.action, 'Passiva');
});

test('parseClasses associa classe específica à natureza pai', () => {
  const { classes } = parseClasses(SAMPLE);
  const t = classes['Titã'];
  assert.equal(t.type, 'especifica');
  assert.equal(t.natureza, 'Brutamontes');
  assert.equal(t.skills.length, 5);
  assert.equal(t.skills[1].action, 'Movimento+Reação');
  assert.equal(t.ultimate.name, 'Bastião');
  assert.equal(t.ultimate.cost, '15S');
});

test('parseClasses ignora intro fora de classe e não cria classe fantasma', () => {
  const { classes } = parseClasses(SAMPLE);
  assert.deepEqual(Object.keys(classes).sort(), ['Sobrevivente', 'Titã'].sort());
});

test('parseClasses emite warning para skill malformada dentro de classe', () => {
  const bad = [
    { heading: 'HEADING1', text: 'Classes' },
    { heading: 'HEADING3', text: 'Classes Gerais' },
    { heading: 'HEADING2', text: 'Combatente' },
    { heading: 'NORMAL', text: 'Foco Total (sei lá) faltou os dois-pontos aqui' },
  ];
  const { warnings } = parseClasses(bad);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Combatente/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: FAIL com "parseClasses is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// adicionar em parser.js
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
      if (!sk.actionKnown) warnings.push(`Classe "${currentClass}": ação não reconhecida em "${sk.name}" → "${sk.action}"`);
      classes[currentClass].skills.push({ name: sk.name, action: sk.action, cost: sk.cost, desc: sk.desc });
      continue;
    }
    if (/\)\s*:/.test(t) || /–\s*\(/.test(t)) {
      warnings.push(`Classe "${currentClass}": linha não reconhecida → "${t.slice(0, 70)}"`);
    }
  }
  return { classes, warnings };
}
```

Atualizar `module.exports` para incluir `parseClasses`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: PASS (todos, ~19 testes).

- [ ] **Step 5: Commit**

```bash
git add tools/rules-parser/
git commit -m "feat(parser): parseClasses (state machine de headings) + warnings"
```

---

### Task 5: Loader puro `resolveClassData` + integração no `ARC_System_V2.html`

**Files:**
- Create: `tools/loader/resolve.js`, `tools/loader/resolve.test.js`
- Modify: `ARC_System_V2.html` (linha 2613; função `init` em 2804-2813)

**Interfaces:**
- Produces: `resolveClassData(remote, cached, embedded) → object` — devolve `remote` se for objeto não-vazio, senão `cached` se não-vazio, senão `embedded`.

- [ ] **Step 1: Write the failing test**

```js
// tools/loader/resolve.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveClassData } = require('./resolve');

const EMB = { Sobrevivente: { type: 'geral', skills: [], ultimate: null } };
const REM = { Combatente: { type: 'geral', skills: [], ultimate: null } };
const CACHE = { Tático: { type: 'geral', skills: [], ultimate: null } };

test('usa remote quando presente', () => assert.equal(resolveClassData(REM, CACHE, EMB), REM));
test('cai para cache quando remote vazio/nulo', () => {
  assert.equal(resolveClassData(null, CACHE, EMB), CACHE);
  assert.equal(resolveClassData({}, CACHE, EMB), CACHE);
});
test('cai para embedded quando remote e cache ausentes', () => {
  assert.equal(resolveClassData(null, null, EMB), EMB);
  assert.equal(resolveClassData({}, {}, EMB), EMB);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/loader/resolve.test.js`
Expected: FAIL com "Cannot find module './resolve'".

- [ ] **Step 3: Write minimal implementation**

```js
// tools/loader/resolve.js
function isNonEmptyObj(o) { return o && typeof o === 'object' && Object.keys(o).length > 0; }
function resolveClassData(remote, cached, embedded) {
  if (isNonEmptyObj(remote)) return remote;
  if (isNonEmptyObj(cached)) return cached;
  return embedded;
}
module.exports = { resolveClassData };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/loader/resolve.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Integrar no HTML — tornar `CLASS_DATA` mutável**

Em `ARC_System_V2.html`, linha 2613, trocar:
```js
    const CLASS_DATA = {
```
por:
```js
    const CLASS_DATA_EMBEDDED = {
```
E imediatamente APÓS o fechamento dessa declaração (após a linha 2740, `};`), inserir:
```js
    let CLASS_DATA = CLASS_DATA_EMBEDDED;
    const FB_RULES_URL = 'https://intitulations-default-rtdb.firebaseio.com/arc_rules.json';
    function _isNonEmptyObj(o) { return o && typeof o === 'object' && Object.keys(o).length > 0; }
    async function loadClassData() {
      let remote = null;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const resp = await fetch(FB_RULES_URL + '?t=' + Date.now(), { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) {
          const data = await resp.json();
          if (data && _isNonEmptyObj(data.classes)) {
            remote = data.classes;
            localStorage.setItem('arc_rules_cache', JSON.stringify(data.classes));
          }
        }
      } catch (e) { /* offline / timeout: usa fallback */ }
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('arc_rules_cache') || 'null'); } catch (e) {}
      CLASS_DATA = _isNonEmptyObj(remote) ? remote : (_isNonEmptyObj(cached) ? cached : CLASS_DATA_EMBEDDED);
    }
```

- [ ] **Step 6: Integrar no HTML — chamar o loader antes de usar `CLASS_DATA`**

Em `ARC_System_V2.html`, função `init()` (linha 2804). Trocar a assinatura `function init() {` por `async function init() {` e inserir, como **primeira** instrução do corpo (antes de `buildMulticlasse()`):
```js
      await loadClassData();
```
(O `window.addEventListener('load', init)` na linha 3858 permanece igual — `init` retorna uma Promise e roda o `await` internamente antes de `buildMulticlasse()`/`updateAll()`, que são os pontos que leem `CLASS_DATA`.)

- [ ] **Step 7: Verificar manualmente (offline-safe)**

1. Abrir `ARC_System_V2.html` por duplo clique **sem internet**.
   Esperado: ficha carrega normal (usa `CLASS_DATA_EMBEDDED`); console sem erro fatal; as classes aparecem nos dropdowns.
2. No console do navegador, rodar: `Object.keys(CLASS_DATA).length`
   Esperado: `14`.

- [ ] **Step 8: Commit**

```bash
git add tools/loader/ ARC_System_V2.html
git commit -m "feat(arc): loader de CLASS_DATA via Firebase REST com fallback offline"
```

---

### Task 6: Apps Script — coleta do Doc, menu, preview e PUT no Firebase

**Files:**
- Create: `apps-script/Ponte.gs`, `apps-script/README.md`

**Interfaces:**
- Consumes: as funções puras (cópia de `parser.js`).
- Produces: menu `Ponte ARC` no Doc com `Pré-visualizar` e `Publicar no Firebase`.

> Esta task é integração no ambiente Google (sem teste automatizado). As funções puras já estão cobertas pelas Tasks 1-4; aqui só se adiciona a casca de I/O e valida-se manualmente.

- [ ] **Step 1: Criar `apps-script/Ponte.gs`**

```js
// ===== Ponte ARC — cola este arquivo no editor de Apps Script do Doc =====
// (Extensões > Apps Script). Funções puras = cópia fiel de tools/rules-parser/parser.js.

// ---- INÍCIO cópia de parser.js (manter idêntico à fonte de verdade) ----
const ACTION_MAP = {
  'passiva':'Passiva','padrão':'Padrão','bônus':'Bônus','movimento':'Movimento','reação':'Reação',
  'livre':'Livre','completo':'Completa','completa':'Completa','fala':'Fala','especial':'Especial','coringa':'Coringa',
  'reação + bônus':'Reação+Bônus','padrão + bônus':'Padrão+Bônus','padrão + movimento':'Padrão+Movimento',
  'reação + movimento':'Movimento+Reação','movimento + reação':'Movimento+Reação','bônus + movimento':'Bônus+Movimento',
};
function normalizeAction(raw){ if(!raw) return {value:'Especial',known:false};
  const base=String(raw).split('->')[0].toLowerCase().replace(/\s+/g,' ').trim();
  if(ACTION_MAP[base]) return {value:ACTION_MAP[base],known:true};
  return {value:String(raw).trim(),known:false}; }
function normalizeCost(raw){ if(raw==null) return null;
  const s=String(raw).replace(/\s*->\s*/g,'+').trim(); return s.length?s:null; }
const SKILL_RE=/^(.+?)\s*\(([^)]+)\)(?:\s*\[([^\]]+)\])?:\s*(.+)$/;
function parseSkillLine(text){ const t=String(text||'').trim(); const m=t.match(SKILL_RE); if(!m) return null;
  const act=normalizeAction(m[2]);
  return {name:m[1].trim(),action:act.value,actionKnown:act.known,cost:normalizeCost(m[3]),desc:m[4].trim()}; }
const QUOTES='"“”\'‘’'; const NAME_RE=new RegExp('^\\s*['+QUOTES+']([^'+QUOTES+']+)['+QUOTES+']');
function parseUltimateHeader(text){ const t=String(text||'').trim(); const nm=t.match(NAME_RE); if(!nm) return null;
  const name=nm[1].trim(); const rest=t.slice(nm[0].length);
  const groups=(rest.match(/\(([^)]*)\)|\[([^\]]*)\]/g)||[]).map(g=>g.replace(/^[([]|[)\]]$/g,'').trim()).filter(Boolean);
  let limit=null,cost=null,action=null;
  for(const g of groups){ if(/por\s+(luta|cena|miss|rodada)|x\s*por|vez/i.test(g)){limit=g;}
    else if(/\d\s*s/i.test(g)||/x\s*\*/i.test(g)){cost=normalizeCost(g);}
    else{action=normalizeAction(g).value;} }
  return {name:name,action:action||'Especial',cost:cost,limit:limit}; }
const NATUREZAS=['Brutamontes','Guerreiro','Atleta','Velocista'];
function parseClasses(paragraphs){ const classes={}; const warnings=[];
  let inClasses=false,mode=null,currentNatureza=null,currentClass=null,pendingUlt=null;
  for(const p of paragraphs){ const heading=p.heading||'NORMAL'; const t=String(p.text||'').trim();
    if(heading==='HEADING1'){ inClasses=/^classes$/i.test(t); mode=null;currentNatureza=null;currentClass=null;pendingUlt=null; continue; }
    if(!inClasses) continue;
    if(heading==='HEADING3'){
      if(/classes\s+gerais/i.test(t)){mode='geral';currentClass=null;pendingUlt=null;continue;}
      if(/classes\s+espec/i.test(t)){mode='especifica';currentClass=null;pendingUlt=null;continue;}
      if(mode==='especifica'&&t){currentClass=t;classes[t]={type:'especifica',natureza:currentNatureza,skills:[],ultimate:null};pendingUlt=null;}
      continue; }
    if(heading==='HEADING2'){
      if(mode==='especifica'&&NATUREZAS.indexOf(t)>=0){currentNatureza=t;currentClass=null;pendingUlt=null;continue;}
      if(t){currentClass=t;classes[t]={type:'geral',skills:[],ultimate:null};pendingUlt=null;} continue; }
    if(!t||!currentClass) continue;
    if(pendingUlt){ classes[currentClass].ultimate=Object.assign({},pendingUlt,{desc:t}); pendingUlt=null; continue; }
    if(/^\s*["“”'‘’]/.test(t)){ const u=parseUltimateHeader(t); if(u){pendingUlt=u;continue;} }
    const sk=parseSkillLine(t);
    if(sk){ if(!sk.actionKnown) warnings.push('Classe "'+currentClass+'": ação não reconhecida em "'+sk.name+'" → "'+sk.action+'"');
      classes[currentClass].skills.push({name:sk.name,action:sk.action,cost:sk.cost,desc:sk.desc}); continue; }
    if(/\)\s*:/.test(t)||/–\s*\(/.test(t)) warnings.push('Classe "'+currentClass+'": linha não reconhecida → "'+t.slice(0,70)+'"');
  }
  return {classes:classes,warnings:warnings}; }
// ---- FIM cópia de parser.js ----

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
  return { rules: { _version: 1, classes: r.classes }, warnings: r.warnings, count: Object.keys(r.classes).length };
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
  if (out.warnings.length) { linhas.push('', '⚠️ AVISOS (' + out.warnings.length + '):'); out.warnings.forEach(function (w) { linhas.push('  - ' + w); }); }
  const safe = linhas.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = HtmlService.createHtmlOutput('<pre style="white-space:pre-wrap;font:13px monospace">' + safe + '</pre>').setWidth(640).setHeight(460);
  DocumentApp.getUi().showModalDialog(html, 'Preview — Ponte ARC');
}
function publicar() {
  const ui = DocumentApp.getUi();
  const out = construirArcRules();
  const aviso = out.warnings.length ? ('\n\n⚠️ ' + out.warnings.length + ' aviso(s)! Veja o Preview antes.') : '';
  const resp = ui.alert('Publicar no Firebase', 'Enviar ' + out.count + ' classes para o ARC?' + aviso, ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;
  const r = UrlFetchApp.fetch('https://intitulations-default-rtdb.firebaseio.com/arc_rules.json', {
    method: 'put', contentType: 'application/json', payload: JSON.stringify(out.rules), muteHttpExceptions: true,
  });
  ui.alert(r.getResponseCode() === 200 ? 'Publicado com sucesso ✓' : ('Erro ' + r.getResponseCode() + ': ' + r.getContentText()));
}
```

- [ ] **Step 2: Criar `apps-script/README.md`** com o passo a passo (instalar no Doc + regras do Firebase). Conteúdo:

```markdown
# Ponte ARC — instalação

## 1. Instalar o script no Doc
1. Abra o Doc "Sistema Intitulados".
2. Extensões → Apps Script.
3. Apague o conteúdo de `Code.gs`, cole todo o `Ponte.gs` e salve.
4. Recarregue o Doc. Vai aparecer o menu **Ponte ARC**.
5. Na 1ª publicação o Google pede autorização (escopo de Documento + requisição externa).
   Em conta pessoal pode aparecer "Google não verificou esta app" → Avançado → Aceder.

## 2. Regras do Firebase (Realtime Database)
No console do Firebase → Realtime Database → Regras, garanta que `arc_rules`
seja LEGÍVEL publicamente (a leitura do ARC é anônima). Mínimo para a V1:

    {
      "rules": {
        "arc_rules": { ".read": true, ".write": true },
        "arc_campaigns": { ".read": true, ".write": true }
      }
    }

> Risco aceito na V1: `arc_rules` fica gravável por quem tiver a URL. Mitigação:
> o ARC mantém cache + dados embutidos. Reforço futuro (fora do escopo): `".write": false`
> em `arc_rules` + token de escrita no Apps Script via `?auth=` (guardado em PropertiesService).

## 3. Uso diário
Editou as classes no Doc → menu **Ponte ARC → Pré-visualizar** (confere contagem e avisos)
→ **Publicar no Firebase**. Os ARCs pegam as novas regras na próxima abertura.
```

- [ ] **Step 3: Verificar manualmente no Doc**

1. Instalar conforme README. Menu "Ponte ARC" aparece.
2. **Pré-visualizar** → o modal deve listar **14 classes**, cada geral com 5 skills + ultimate, cada específica com sua natureza, e **0 avisos** (ou avisos explicáveis — ex.: "Aceleração Tática" com travessão; nesse caso, corrigir no Doc para `Nome (ação) [custo]: desc` e pré-visualizar de novo).
3. Conferir 1-2 classes contra o Doc (nomes, custos, ultimate).

- [ ] **Step 4: Commit**

```bash
git add apps-script/
git commit -m "feat(ponte): Apps Script (coleta Doc + menu + preview + PUT Firebase)"
```

---

### Task 7: Primeira publicação e verificação ponta-a-ponta

**Files:** nenhum (operação + verificação).

- [ ] **Step 1: Publicar pela primeira vez**

No Doc: **Ponte ARC → Pré-visualizar** (confirmar 14 classes, 0 avisos inesperados) → **Publicar no Firebase**. Esperado: "Publicado com sucesso ✓".

- [ ] **Step 2: Conferir o nó no Firebase**

No console do Firebase (Realtime Database), abrir `arc_rules`. Esperado: `_version: 1` e `classes` com 14 chaves; cada classe com `skills` (5) e `ultimate`.

- [ ] **Step 3: Verificar o ARC carregando da nuvem**

1. Abrir `ARC_System_V2.html` (com internet). No console: `Object.keys(CLASS_DATA).length` → `14`.
2. Conferir que uma classe específica (ex.: Titã) mostra as 5 skills + ultimate na UI.
3. **Nota esperada:** descrições agora vêm do Doc (mais completas que os resumos antigos), e eventuais nomes que estavam dessincronizados (ex.: "Hackear árvores") passam a refletir o Doc.

- [ ] **Step 4: Teste do cenário "50% → 33%"**

1. No Doc, editar a descrição de uma skill (ex.: trocar um número numa skill do Sobrevivente). **Publicar**.
2. Recarregar `ARC_System_V2.html`. Esperado: a descrição nova aparece — **sem editar HTML**.

- [ ] **Step 5: Teste de degradação segura (offline)**

Desligar a internet, abrir o ARC. Esperado: funciona com a última cópia em cache (ou embutido). Sem tela branca, sem erro fatal.

- [ ] **Step 6: Commit (marco)**

```bash
git commit --allow-empty -m "chore: V1 de sincronização de classes validada ponta-a-ponta"
```

---

## Self-Review

**Spec coverage:**
- Peça 1 (Apps Script: ler Doc, traduzir, preview, PUT) → Tasks 1-4 (parser) + Task 6 (casca). ✓
- Peça 2 (Firebase `/arc_rules`) → Task 6 (regras) + Task 7 (seed). ✓
- Peça 3 (loader nos ARCs com fallback) → Task 5. ✓ (escopo corrigido: só `ARC_System_V2.html`).
- Convenção de formato §5 + variações → Tasks 1-4 (setas, ultimate `()/[]`, `X*3S`, travessão→warning). ✓
- Critérios de sucesso §9 (14 classes; 50%→33%; offline; malformado→⚠️) → Tasks 5-7. ✓
- Risco "erro silencioso" → preview com avisos (Task 6) + publicação confirmada. ✓

**Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código; comandos com saída esperada. ✓

**Type consistency:** `parseClasses` produz `{name,action,cost,desc}` (skills) e `{name,action,cost,limit,desc}` (ultimate), iguais ao consumido por `renderClasseGeral/renderClasseEsp/renderMulticlasse`. `resolveClassData`/`loadClassData` operam sobre o mesmo formato (`classes`). `arc_rules` = `{_version, classes}` é escrito pelo `.gs` (Task 6) e lido pelo loader (Task 5) — chave `classes` consistente nos dois lados. ✓

**Gap conhecido (não-bloqueante, fora do escopo V1):** a função pura aparece duplicada em `parser.js` (fonte/testes) e em `Ponte.gs` (runtime do Apps Script), por limitação de import do Apps Script. Mantê-las em sincronia é manual. Alternativa futura: `clasp` + módulos.
