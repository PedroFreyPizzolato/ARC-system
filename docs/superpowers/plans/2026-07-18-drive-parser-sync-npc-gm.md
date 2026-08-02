# Sync Doc→Firebase para NPC Catalog e GM Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o NPC Catalog e o GM Screen puxarem as regras do mesmo `arc_rules.json` (Doc→Firebase) que o ARC System V3 já usa, sem quebrar os cálculos próprios do NPC.

**Architecture:** Estende o parser compartilhado para expor as fórmulas granulares de natureza; adiciona um módulo puro testado de adaptadores (Firebase→shape local); cada HTML ganha um `loadRules()` no padrão do V3 (fetch→cache→fallback embutido) com adaptadores merge-if-present que preservam os metadados de cálculo (estrelas `hpB/caB/movB/sanB`) do NPC.

**Tech Stack:** JS vanilla (browser, sem framework), Node.js `node:test`/`assert` para os testes, Google Apps Script (`Ponte.gs`). Sync via `fetch` REST no Firebase RTDB (sem SDK).

## Global Constraints

- `tools/rules-parser/parser.js` e `apps-script/Ponte.gs` devem permanecer **byte-idênticos** na região entre `// ---- INÍCIO cópia` e `// ---- FIM cópia` — `parity.test.js` falha se divergirem. Toda mudança no parser entra nos **dois** arquivos com o mesmo texto.
- As funções puras de `tools/rules-parser/adapters.js` são copiadas inline nos HTMLs com o comentário `// cópia fiel de tools/rules-parser/adapters.js`. Mudou uma, mude nas duas.
- Firebase URL (constante, os três apps): `https://intitulations-default-rtdb.firebaseio.com/arc_rules.json`
- **Merge-if-present:** nenhum adaptador zera dado embutido. Campo/seção ausente no Firebase → mantém o embutido.
- Sem novas dependências. `loadRules()` usa `fetch` + `AbortController` (timeout 4s), como o V3. Nada de Firebase SDK aqui.
- Comando de teste (raiz do repo): `node --test tools/rules-parser/parser.test.js tools/rules-parser/parity.test.js tools/rules-parser/adapters.test.js`
- Baseline atual: 54 testes passando (parser + parity).

---

## File Structure

- `tools/rules-parser/parser.js` — **modificar** `parseStatus` (~L253-259): expor campos granulares.
- `tools/rules-parser/parser.test.js` — **modificar**: novos asserts dos campos granulares.
- `apps-script/Ponte.gs` — **modificar** `parseStatus` (~L264-270): espelho exato de parser.js.
- `tools/rules-parser/adapters.js` — **criar**: funções puras Firebase→shape local.
- `tools/rules-parser/adapters.test.js` — **criar**: testes das funções puras.
- `ARC_NPC_Catalog_V2.html` — **modificar**: `loadRules()`+adaptadores inline; `load()`→`boot()`; `STATUS_NEG/POS` viram `let`.
- `ARC_GM_Screen_V2.html` — **modificar**: `loadRules()`+`applyEffects` inline; `init()` async; `SNEG/SPOS` viram `let`.

---

## Task 1: Parser — expor fórmulas granulares por natureza

**Files:**
- Modify: `tools/rules-parser/parser.js:253-259`
- Test: `tools/rules-parser/parser.test.js` (após os testes de `parseStatus`, ~L161)
- Modify: `apps-script/Ponte.gs:264-270` (espelho)

**Interfaces:**
- Produces: `parseStatus(paragraphs).natures[nat]` passa a conter, além de `hp`/`sta`, os campos `hpBase`, `hpNivel`, `staBase`, `staNivel`, `staRec` (todos strings cruas do Doc, presentes só quando existem).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `tools/rules-parser/parser.test.js` logo após o teste `parseStatus: mapeia "Brutamonte"...` (~L161):

```js
test('parseStatus: expõe fórmulas granulares por natureza (hpBase/hpNivel/staBase/staNivel/staRec)', () => {
  const { natures } = parseStatus(SAMPLE_STATUS);
  assert.equal(natures.Brutamontes.hpBase, '10 + 5d4 + 5*Corpo');
  assert.equal(natures.Brutamontes.hpNivel, '5 + 3*Corpo');
  assert.equal(natures.Brutamontes.staBase, '5 + 3d6 + 3*Corpo');
  assert.equal(natures.Brutamontes.staNivel, '2 + Corpo');
  assert.equal(natures.Brutamontes.staRec, '5 > 7 > 10 > 15');
  // Guerreiro não tem stamina no fixture → granulares de stamina ausentes; hp continua
  assert.equal(natures.Guerreiro.hpBase, '10 + 3d8 + 3*Corpo');
  assert.equal(natures.Guerreiro.staBase, undefined);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: FAIL — o novo teste falha com `undefined !== '10 + 5d4 + 5*Corpo'` (campos ainda não existem). Os 54 testes anteriores continuam passando.

- [ ] **Step 3: Implementar em parser.js**

Substituir o bloco `const natures = {}; ...` em `tools/rules-parser/parser.js` (L253-259) por:

```js
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tools/rules-parser/parser.test.js`
Expected: PASS — 55 testes (54 + 1 novo).

- [ ] **Step 5: Espelhar a mesma mudança em Ponte.gs**

Em `apps-script/Ponte.gs`, o bloco idêntico está em `parseStatus` (L264-270). Substituir por **exatamente o mesmo texto** do Step 3 (o bloco `const natures = {} ... });`). É a mesma sequência de linhas; o `parity.test.js` só passa se o texto casar.

- [ ] **Step 6: Rodar parity e confirmar que passa**

Run: `node --test tools/rules-parser/parser.test.js tools/rules-parser/parity.test.js`
Expected: PASS — inclusive `Ponte.gs parseStatus idêntico ao parser.js (anti-drift)`.

- [ ] **Step 7: Commit**

```bash
git add tools/rules-parser/parser.js tools/rules-parser/parser.test.js apps-script/Ponte.gs
git commit -m "feat(parser): expõe fórmulas granulares de natureza (hpBase/staBase/...) p/ sync do NPC"
```

---

## Task 2: Módulo de adaptadores puros (Firebase → shape local)

**Files:**
- Create: `tools/rules-parser/adapters.js`
- Test: `tools/rules-parser/adapters.test.js`

**Interfaces:**
- Produces (todas puras, `module.exports`):
  - `normFormula(s: string|null) → string|null` — `*`→`×`, ` > `→`→`, remove espaços em torno de `+`.
  - `mapSkill(s: {name,action,cost,desc,lb?}) → {n,a,c,d,lb?}`
  - `mapClass(c: {type,natureza?,skills[],ultimate?}) → {tipo:'g'|'e', nat?, sk:[{n,a,c,d,lb?}], ult: {n,a,c,d,lim?}|null}`
  - `mapNature(nat: {buff?,debuff?,habUnica?,hpBase?,hpNivel?,staBase?,staNivel?,staRec?}) → {buff?,debuff?,habUnica?,hpF?,hpL?,staF?,staL?,staRec?}` (nunca inclui `caBase`)
  - `effectNames(section: {items:[{name}]}|null) → string[]|null`
  - `preserveStars(oldSkills:[], newSkills:[]) → {skills:[], lostStars:string[]}` — copia `hpB/caB/movB/sanB` das skills antigas p/ as novas de mesmo `n`; nomes com estrela sem par vão em `lostStars`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tools/rules-parser/adapters.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { normFormula, mapSkill, mapClass, mapNature, effectNames, preserveStars } = require('./adapters');

test('normFormula: * → ×, " > " → →, remove espaços em torno de +', () => {
  assert.equal(normFormula('10 + 5d4 + 5*Corpo'), '10+5d4+5×Corpo');
  assert.equal(normFormula('5 > 7 > 10 > 15'), '5→7→10→15');
  assert.equal(normFormula('3+Corpo+Mente'), '3+Corpo+Mente');
  assert.equal(normFormula(null), null);
});

test('mapSkill: renomeia campos e preserva lb', () => {
  assert.deepEqual(mapSkill({ name: 'X', action: 'Completa', cost: '4S', desc: 'd', lb: true }),
    { n: 'X', a: 'Completa', c: '4S', d: 'd', lb: true });
  assert.deepEqual(mapSkill({ name: 'Y', action: 'Passiva', cost: null, desc: 'z' }),
    { n: 'Y', a: 'Passiva', c: null, d: 'z' });
});

test('mapClass: específica → tipo "e" com natureza e ultimate', () => {
  const cl = mapClass({ type: 'especifica', natureza: 'Brutamontes',
    skills: [{ name: 'Pele de Aço', action: 'Passiva', cost: null, desc: 'x' }],
    ultimate: { name: 'Bastião', action: 'Especial', cost: '15S', limit: '1×/luta', desc: 'y' } });
  assert.equal(cl.tipo, 'e');
  assert.equal(cl.nat, 'Brutamontes');
  assert.deepEqual(cl.sk[0], { n: 'Pele de Aço', a: 'Passiva', c: null, d: 'x' });
  assert.deepEqual(cl.ult, { n: 'Bastião', a: 'Especial', c: '15S', d: 'y', lim: '1×/luta' });
});

test('mapClass: geral → tipo "g", sem natureza/ultimate', () => {
  const cl = mapClass({ type: 'geral', skills: [] });
  assert.equal(cl.tipo, 'g');
  assert.equal(cl.nat, undefined);
  assert.equal(cl.ult, null);
});

test('preserveStars: copia hpB p/ skill de mesmo nome, mantendo texto novo', () => {
  const { skills, lostStars } = preserveStars(
    [{ n: 'Pele de Aço', d: 'velho', hpB: 1 }],
    [{ n: 'Pele de Aço', d: 'novo' }]);
  assert.equal(skills[0].hpB, 1);
  assert.equal(skills[0].d, 'novo');
  assert.deepEqual(lostStars, []);
});

test('preserveStars: estrela sem par (skill renomeada) → lostStars', () => {
  const { lostStars } = preserveStars([{ n: 'Pele de Aço', hpB: 1 }], [{ n: 'Pele de Ferro' }]);
  assert.deepEqual(lostStars, ['Pele de Aço']);
});

test('preserveStars: skill sem estrela nunca gera lostStars', () => {
  assert.deepEqual(preserveStars([{ n: 'A' }], [{ n: 'B' }]).lostStars, []);
});

test('mapNature: normaliza fórmulas, mapeia habUnica, não inclui caBase', () => {
  const o = mapNature({ buff: 'b', debuff: 'd',
    habUnica: { name: 'Avanço', action: 'Especial', cost: '4S', desc: 'z' },
    hpBase: '10 + 5d4 + 5*Corpo', staRec: '5 > 7 > 10 > 15' });
  assert.equal(o.buff, 'b');
  assert.equal(o.hpF, '10+5d4+5×Corpo');
  assert.equal(o.staRec, '5→7→10→15');
  assert.deepEqual(o.habUnica, { n: 'Avanço', a: 'Especial', c: '4S', d: 'z' });
  assert.equal('caBase' in o, false);
  assert.equal('hpL' in o, false); // hpNivel ausente → hpL ausente
});

test('effectNames: extrai nomes; vazio/nulo → null', () => {
  assert.deepEqual(effectNames({ items: [{ name: 'Morrendo' }, { name: 'Cegueira' }] }), ['Morrendo', 'Cegueira']);
  assert.equal(effectNames(null), null);
  assert.equal(effectNames({ items: [] }), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tools/rules-parser/adapters.test.js`
Expected: FAIL — `Cannot find module './adapters'`.

- [ ] **Step 3: Implementar adapters.js**

Criar `tools/rules-parser/adapters.js`:

```js
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tools/rules-parser/adapters.test.js`
Expected: PASS — 9 testes.

- [ ] **Step 5: Rodar a suíte completa**

Run: `node --test tools/rules-parser/parser.test.js tools/rules-parser/parity.test.js tools/rules-parser/adapters.test.js`
Expected: PASS — 64 testes (55 + 9).

- [ ] **Step 6: Commit**

```bash
git add tools/rules-parser/adapters.js tools/rules-parser/adapters.test.js
git commit -m "feat(sync): módulo puro de adaptadores Firebase→shape local (classes/natures/efeitos) + testes"
```

---

## Task 3: NPC Catalog — loadRules() + adaptadores inline

**Files:**
- Modify: `ARC_NPC_Catalog_V2.html:1290-1291` (`STATUS_NEG`/`STATUS_POS`: `const`→`let`)
- Modify: `ARC_NPC_Catalog_V2.html:2163` (`load();` → boot assíncrono)
- Modify: `ARC_NPC_Catalog_V2.html` (inserir bloco de sync antes de `load()`)

**Interfaces:**
- Consumes: `mapClass`, `mapSkill`, `mapNature`, `effectNames`, `preserveStars`, `normFormula` (cópia fiel de `adapters.js`, Task 2); campos granulares de `parseStatus` (Task 1) via Firebase.
- Consumes (embutidos no arquivo): `CL` (L1285), `SA` (L1196), `NATURE_DATA` (L1134), `STATUS_NEG`/`STATUS_POS` (L1290-1291), `load()` (L2126), `render()`.

- [ ] **Step 1: Tornar STATUS_NEG/STATUS_POS reatribuíveis**

Em `ARC_NPC_Catalog_V2.html` L1290-1291, trocar `const` por `let` nas duas linhas:

```js
    let STATUS_NEG = ['Morrendo', 'Terreno Difícil', 'Quebrado', 'Amedrontado', 'Atordoado', 'Membro Quebrado', 'Imobilizado', 'Em Choque', 'Vulnerável', 'Exaustão', 'Exaustão Grave', 'Fraqueza', 'Derrubado', 'Desprotegido', 'Exposto', 'Suprimido', 'Cegueira'];
    let STATUS_POS = ['Fortificado', 'Acelerado', 'Focado', 'Imparável', 'Blindado', 'Energizado', 'Fortalecido', 'Protegido'];
```

- [ ] **Step 2: Inserir o bloco de sync antes de `load();`**

Em `ARC_NPC_Catalog_V2.html`, imediatamente **antes** da linha `load();` (L2163), inserir:

```js
    // ═══════════════════════════════════════════════════════════════
    // SYNC: regras do Doc → Firebase → NPC Catalog (fallback embutido/cache)
    // Funções puras abaixo = cópia fiel de tools/rules-parser/adapters.js. Mudou uma, mude nas duas.
    // ═══════════════════════════════════════════════════════════════
    const FB_RULES_URL = 'https://intitulations-default-rtdb.firebaseio.com/arc_rules.json';
    function normFormula(s) {
      if (s == null) return s;
      return String(s).replace(/\*/g, '×').replace(/\s*>\s*/g, '→').replace(/\s*\+\s*/g, '+').trim();
    }
    function mapSkill(s) {
      const o = { n: s.name, a: s.action || '', c: s.cost == null ? null : s.cost, d: s.desc || '' };
      if (s.lb) o.lb = true;
      return o;
    }
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
    function mapNature(nat) {
      const o = {};
      if (nat.buff != null) o.buff = nat.buff;
      if (nat.debuff != null) o.debuff = nat.debuff;
      if (nat.habUnica) { const h = nat.habUnica; o.habUnica = { n: h.name, a: h.action || '', c: h.cost == null ? null : h.cost, d: h.desc || '' }; }
      if (nat.hpBase != null) o.hpF = normFormula(nat.hpBase);
      if (nat.hpNivel != null) o.hpL = normFormula(nat.hpNivel);
      if (nat.staBase != null) o.staF = normFormula(nat.staBase);
      if (nat.staNivel != null) o.staL = normFormula(nat.staNivel);
      if (nat.staRec != null) o.staRec = normFormula(nat.staRec);
      return o;
    }
    function effectNames(section) {
      if (!section || !Array.isArray(section.items)) return null;
      const names = section.items.map(function (i) { return i.name; }).filter(Boolean);
      return names.length ? names : null;
    }
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

    // ── Aplicadores (merge-if-present; preservam estrelas de cálculo) ──
    function applyClasses(fb) {
      if (!fb) return;
      Object.keys(fb).forEach(function (name) {
        const mapped = mapClass(fb[name]);
        const old = CL[name];
        const res = preserveStars(old && old.sk, mapped.sk);
        if (res.lostStars.length) { console.warn('[sync] classe "' + name + '": estrela sem par no Doc, mantendo embutido:', res.lostStars); return; }
        mapped.sk = res.skills;
        CL[name] = mapped;
      });
    }
    function applySubattrs(fb) {
      if (!fb) return;
      Object.keys(fb).forEach(function (key) {
        if (!SA[key]) return; // só chaves de subatributo conhecidas
        const mapped = (fb[key] || []).map(mapSkill);
        const res = preserveStars(SA[key], mapped);
        if (res.lostStars.length) { console.warn('[sync] subatributo "' + key + '": estrela sem par, mantendo embutido:', res.lostStars); return; }
        SA[key] = res.skills;
      });
    }
    function applyNatures(fb) {
      if (!fb) return;
      Object.keys(fb).forEach(function (nat) { if (NATURE_DATA[nat]) Object.assign(NATURE_DATA[nat], mapNature(fb[nat])); });
    }
    function applyEffects(sys) {
      if (!sys) return;
      const neg = effectNames(sys.efeitosNegativos), pos = effectNames(sys.efeitosPositivos);
      if (neg) STATUS_NEG = neg;
      if (pos) STATUS_POS = pos;
    }
    async function loadRules() {
      let data = null;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const resp = await fetch(FB_RULES_URL + '?t=' + Date.now(), { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) { const d = await resp.json(); if (d) { data = d; localStorage.setItem('arc_npc_rules_cache', JSON.stringify(d)); } }
      } catch (e) { /* offline/timeout: usa cache/embutido */ }
      if (!data) { try { data = JSON.parse(localStorage.getItem('arc_npc_rules_cache') || 'null'); } catch (e) { } }
      if (!data) return; // sem rede e sem cache → mantém embutido
      applyClasses(data.classes);
      applySubattrs(data.subattrs);
      if (data.status) applyNatures(data.status.natures);
      if (data.systems) applyEffects(data.systems);
    }
```

- [ ] **Step 3: Trocar o boot `load();` por boot assíncrono**

Em `ARC_NPC_Catalog_V2.html`, a última linha do script (`load();`, L2163) vira:

```js
    (async function boot() { await loadRules(); load(); })();
```

- [ ] **Step 4: Verificar no navegador — offline (fallback embutido)**

Abrir `ARC_NPC_Catalog_V2.html` no navegador **com a aba Network em modo Offline** (DevTools → Network → Offline) e recarregar. No Console, colar:

```js
console.log('CL Sobrevivente:', !!CL['Sobrevivente'], '| Titã hpB:', CL['Titã'].sk[0].hpB, '| STATUS_NEG len:', STATUS_NEG.length);
```
Expected: `CL Sobrevivente: true | Titã hpB: 1 | STATUS_NEG len: 17` — sem erros no console; a UI renderiza normalmente (embutido intacto, estrela do Titã preservada).

- [ ] **Step 5: Verificar no navegador — online (overlay do Firebase)**

Voltar a Network para online e recarregar. No Console:

```js
console.log('estrela Titã ainda presente?', CL['Titã'].sk[0].hpB === 1, '| Brutamontes hpF:', NATURE_DATA['Brutamontes'].hpF, '| caBase:', NATURE_DATA['Brutamontes'].caBase);
```
Expected: `estrela Titã ainda presente? true | Brutamontes hpF: <fórmula com × e sem espaços> | caBase: 8` — nenhum `[sync]` warn de estrela perdida; `caBase` preservado (8). Selecionar um NPC Brutamontes e confirmar que HP/CA calculam igual a antes.

- [ ] **Step 6: Commit**

```bash
git add ARC_NPC_Catalog_V2.html
git commit -m "feat(npc): sync de classes/subattrs/naturezas/efeitos do Doc (loadRules + preserva estrelas)"
```

---

## Task 4: GM Screen — loadRules() + sync de efeitos

**Files:**
- Modify: `ARC_GM_Screen_V2.html:1799-1800` (`SNEG`/`SPOS`: `const`→`let`)
- Modify: `ARC_GM_Screen_V2.html:1853-1861` (`init()` → `async`, `await loadRules()`)
- Modify: `ARC_GM_Screen_V2.html` (inserir `loadRules()`+`applyEffects` antes de `init()`)

**Interfaces:**
- Consumes: `effectNames` (cópia fiel de `adapters.js`); `SNEG`/`SPOS` (L1799-1800), `init()`/`renderApp()`.

- [ ] **Step 1: Tornar SNEG/SPOS reatribuíveis**

Em `ARC_GM_Screen_V2.html` L1799-1800, trocar `const` por `let`:

```js
    let SNEG = ['Morrendo', 'Terreno Difícil', 'Quebrado', 'Amedrontado', 'Atordoado', 'Membro Quebrado', 'Imobilizado', 'Em Choque', 'Vulnerável', 'Exaustão', 'Exaustão Grave', 'Fraqueza', 'Derrubado', 'Desprotegido', 'Exposto', 'Suprimido', 'Cegueira'];
    let SPOS = ['Fortificado', 'Acelerado', 'Focado', 'Imparável', 'Blindado', 'Energizado', 'Fortalecido', 'Protegido'];
```

- [ ] **Step 2: Inserir loadRules() antes de `function init()`**

Em `ARC_GM_Screen_V2.html`, imediatamente **antes** de `function init()` (L1853), inserir:

```js
    // ── SYNC: efeitos do Doc → Firebase → GM Screen (fallback embutido/cache) ──
    // effectNames = cópia fiel de tools/rules-parser/adapters.js. Mudou uma, mude nas duas.
    const FB_RULES_URL = 'https://intitulations-default-rtdb.firebaseio.com/arc_rules.json';
    function effectNames(section) {
      if (!section || !Array.isArray(section.items)) return null;
      const names = section.items.map(function (i) { return i.name; }).filter(Boolean);
      return names.length ? names : null;
    }
    function applyEffects(sys) {
      if (!sys) return;
      const neg = effectNames(sys.efeitosNegativos), pos = effectNames(sys.efeitosPositivos);
      if (neg) SNEG = neg;
      if (pos) SPOS = pos;
    }
    async function loadRules() {
      let data = null;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const resp = await fetch(FB_RULES_URL + '?t=' + Date.now(), { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) { const d = await resp.json(); if (d) { data = d; localStorage.setItem('arc_gm_rules_cache', JSON.stringify(d)); } }
      } catch (e) { /* offline/timeout: usa cache/embutido */ }
      if (!data) { try { data = JSON.parse(localStorage.getItem('arc_gm_rules_cache') || 'null'); } catch (e) { } }
      if (!data) return;
      if (data.systems) applyEffects(data.systems);
    }
```

- [ ] **Step 3: Tornar `init()` assíncrona e aguardar loadRules()**

Em `ARC_GM_Screen_V2.html`, alterar a assinatura e a primeira linha de `init()` (L1853-1855):

```js
    async function init() {
      await loadRules();
      const sv = localStorage.getItem('arc_gm_v2');
```
(o resto do corpo de `init()` — incluindo `renderApp()` no fim — permanece igual.)

- [ ] **Step 4: Verificar no navegador**

Abrir `ARC_GM_Screen_V2.html`. No Console:

```js
console.log('SNEG len:', SNEG.length, '| SPOS len:', SPOS.length);
```
Expected online: `SNEG len: 17 | SPOS len: 8` (ou os valores publicados no Doc), sem erros no console; a tela renderiza normalmente. Em Offline sem cache: mantém os embutidos (17/8). O registro `window.addEventListener('load', init)` (L2752) continua sendo o único disparo — agora aguardando o sync antes do 1º render.

- [ ] **Step 5: Commit**

```bash
git add ARC_GM_Screen_V2.html
git commit -m "feat(gm): sync das listas de efeitos (SNEG/SPOS) do Doc via loadRules"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- Extensão do parser (fórmulas granulares) → Task 1. ✓
- Módulo de adaptação com preservação de estrelas → Task 2. ✓
- NPC: classes + subattrs + naturezas + efeitos, merge-if-present, boot antes do render → Task 3. ✓
- GM: só efeitos (SNEG/SPOS) → Task 4. ✓
- Offline/erros (timeout→cache→embutido) → loadRules em Task 3/4. ✓
- caBase fora de escopo (mantido embutido) → mapNature nunca emite caBase (Task 2, testado). ✓
- Normalização leve de fórmulas → normFormula (Task 2, testado; usado em Task 3). ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo com código ou comando concreto. ✓

**Type consistency:** `mapClass`/`mapSkill`/`mapNature`/`effectNames`/`preserveStars`/`normFormula` têm assinaturas idênticas em `adapters.js` (Task 2) e nas cópias inline (Task 3/4). `{skills, lostStars}` consumido igual nos wrappers. Campos granulares (`hpBase/hpNivel/staBase/staNivel/staRec`) produzidos em Task 1 e consumidos em `mapNature`. ✓
