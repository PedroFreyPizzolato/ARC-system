# Design — Sync Doc→Firebase para NPC Catalog e GM Screen

**Data:** 2026-07-18
**Branch:** feat/arc-sync-subattrs

## Objetivo

Replicar o pipeline "Google Doc → Firebase (`arc_rules.json`) → app" que hoje existe só no
`ARC_System_V3.html` para os outros dois apps: `ARC_NPC_Catalog_V2.html` e `ARC_GM_Screen_V2.html`.
Assim, editar o Doc e publicar (menu **Ponte ARC → Publicar**) atualiza os três apps, em vez de
manter classes/naturezas/efeitos duplicados à mão em cada arquivo.

Os três leem o **mesmo** nó `arc_rules.json`. O `Ponte.gs`/parser continuam sendo a única fonte
de publicação; a única mudança no parser é expor as fórmulas granulares de natureza (já parseadas
internamente) para o NPC conseguir montar seu `NATURE_DATA`.

## Restrição descoberta (o que torna isto não-trivial)

O `loadRules()` do V3 faz **substituição total** (`CLASS_DATA = data.classes`) porque lá os dados
embutidos têm exatamente o mesmo shape do Firebase. Nos outros dois isso **não** vale:

- **NPC Catalog** usa shape próprio e — crítico — carrega **metadados de cálculo** que o Firebase
  não tem, em `CL` (classes) e na estrutura embutida de subatributos:
  - Estrelas `hpB` / `caB` / `movB` / `sanB` → alimentam o cálculo de HP/CA/MOV/SAN.
  - `lb` (limit break) → o Firebase até carrega `lb` nos subatributos, mas **não** as estrelas.
  Um overwrite ingênuo apagaria as estrelas e quebraria a matemática dos NPCs (falha silenciosa).
- `caBase` (por natureza, usado no cálculo de CA) **não existe no Doc** → permanece embutido.
- **GM Screen** só compartilha as listas de efeitos (`SNEG`/`SPOS`); sem estrelas. Trivial.

Consequência: o NPC precisa de um **overlay merge-if-present com preservação de estrelas por nome**,
não de substituição total.

## Mapa de shapes (Firebase → local)

### Classes: `data.classes[Nome]` → `CL[Nome]` (NPC)
| Firebase | NPC (`CL`) |
|---|---|
| `type: 'geral'\|'especifica'` | `tipo: 'g'\|'e'` |
| `natureza` | `nat` |
| `skills: [{name, action, cost, desc}]` | `sk: [{n, a, c, d}]` |
| `ultimate: {name, action, cost, limit, desc}` | `ult: {n, a, c, lim, d}` |
| — (não existe) | `sk[i].hpB/caB/movB/sanB` → **preservar do embutido** |

### Subatributos: `data.subattrs[chave]` → estrutura embutida do NPC (`forca`, `vigor`, …)
| Firebase | NPC |
|---|---|
| `[{name, action, cost, desc, lb?}]` | `[{n, a, c, d, lb?}]` |
| — | `hpB/caB/movB/sanB` → **preservar do embutido** |

### Naturezas: `data.status.natures[nat]` → `NATURE_DATA[nat]` (NPC)
| Firebase | NPC |
|---|---|
| `buff`, `debuff` | `buff`, `debuff` |
| `habUnica: {name, action, cost, desc}` | `habUnica: {n, a, c, d}` |
| `hpBase` *(novo)* | `hpF` (normalizado) |
| `hpNivel` *(novo)* | `hpL` (normalizado) |
| `staBase` *(novo)* | `staF` (normalizado) |
| `staNivel` *(novo)* | `staL` (normalizado) |
| `staRec` *(novo)* | `staRec` (normalizado) |
| — (não existe) | `caBase` → **mantém embutido** |

### Efeitos: `data.systems.efeitosNegativos/Positivos.items[].name`
→ `STATUS_NEG`/`STATUS_POS` (NPC) e `SNEG`/`SPOS` (GM).

## Componentes

### 1. Extensão do parser — `tools/rules-parser/parser.js` + `apps-script/Ponte.gs`

`parseStatus` já acumula internamente `vida0`, `vidaN`, `stamina0`, `staminaN`, `staR`, mas só os
emite combinados em `hp`/`sta`. Passa a emitir também, **guardados por existência**:

```js
if (a.vida0)    o.hpBase  = a.vida0;
if (a.vidaN)    o.hpNivel = a.vidaN;
if (a.stamina0) o.staBase  = a.stamina0;
if (a.staminaN) o.staNivel = a.staminaN;
if (a.staR)     o.staRec   = a.staR;
```

`hp`/`sta` combinados **permanecem** (V3 depende deles). Campos novos são ignorados por quem não usa.
`parser.js` e `Ponte.gs` são cópia fiel um do outro (regra do topo do `Ponte.gs`) → a mesma mudança
entra nos dois. `parity.test.js` garante a igualdade. **`caBase` fica de fora** (não está no Doc).

### 2. NPC Catalog — `ARC_NPC_Catalog_V2.html`

`loadRules()` copiando o padrão do V3:
```
fetch(FB_RULES_URL + '?t=' + Date.now(), timeout 4s)
  → sucesso: usa e grava cache localStorage 'arc_npc_rules_cache'
  → falha/offline: usa cache
  → sem cache: usa embutido (não faz nada)
```
Roda **antes do 1º render**: `load()` (linha ~2163) vira `boot()` → `await loadRules(); load();`.

Adaptadores (todos merge-if-present; nunca zeram o embutido):

- **`applyClasses(fbClasses)`** — para cada classe do Firebase, monta o objeto no shape do NPC e
  **reatribui `CL[nome]`**, preservando estrelas via `preserveStars`.
- **`applySubattrs(fbSubs)`** — idem para cada chave de subatributo.
- **`preserveStars(oldSkills, newSkills)`** — helper único: casa por `n` (nome); copia
  `hpB/caB/movB/sanB` do antigo para o novo de mesmo nome. Se um skill embutido **tinha** estrela e
  não achou par no Firebase (renomeado no Doc), **mantém o skill embutido** naquela posição e
  `console.warn` o nome — nunca perde cálculo em silêncio.
- **`applyNatures(fbNatures)`** — para cada natureza, sobrescreve `buff/debuff/habUnica` e
  `hpF/hpL/staF/staL/staRec` (via `normFormula`); `caBase` intacto.
- **`applyEffects(systems)`** — `STATUS_NEG`/`STATUS_POS` recebem os `items[].name`.
- **`normFormula(s)`** — normalização leve de exibição: `*`→`×`, ` > `→`→`, remove espaços em
  torno de `+`. (Fórmulas são texto de exibição; o cálculo numérico do NPC é hardcoded por natureza,
  não deriva dessas strings.)

`STATUS_NEG`/`STATUS_POS` passam de `const` para `let` (são reatribuídos). `CL` e `NATURE_DATA`
seguem `const` (mutados por chave).

### 3. GM Screen — `ARC_GM_Screen_V2.html`

Mesmo `loadRules()` (fetch/cache `arc_gm_rules_cache`/fallback). `init()` (linha ~1853) vira
`async` com `await loadRules()` antes de `renderApp()`. Único adaptador: `applyEffects` →
`SNEG`/`SPOS` (passam a `let`). `NATS` fica fixo (4 naturezas, não muda).

## Fluxo de dados

```
Google Doc  --(Apps Script: Ponte ARC → Publicar)-->  Firebase RTDB /arc_rules.json
                                                              |
                     +----------------------+-----------------+
                     |                      |                 |
            ARC_System_V3            NPC_Catalog          GM_Screen
          loadRules()→overlay     loadRules()→overlay   loadRules()→overlay
          (substituição total)   (merge + preserva ★)   (só efeitos)
```

## Erros / offline

Idêntico ao V3: `AbortController` 4s + `try/catch`. Timeout ou rede caída → cache localStorage →
dados embutidos. O app **nunca** quebra por causa do sync; no pior caso mostra o embutido.

## Testes / verificação

- **`parser.test.js`** (Node, TDD): novos asserts para os campos granulares —
  `natures.Brutamontes.hpBase === '10 + 5d4 + 5*Corpo'`, `.staRec === '5 > 7 > 10 > 15'`, e que
  `Guerreiro.staBase` continua `undefined` (sem stamina no fixture). Asserts atuais de `hp`/`sta`
  continuam passando.
- **`parity.test.js`**: continua garantindo `Ponte.gs` == `parser.js`.
- **Self-check dos adaptadores do NPC** (`demo()` com `assert`, sem framework): dado um `CL` com
  `hpB` e um `fbClasses` sem `hpB`, `applyClasses` mantém `hpB` e atualiza `d` (descrição); dado
  natureza do Firebase, `applyNatures` preenche `hpF` normalizado e preserva `caBase`.
- **Manual**: abrir NPC e GM offline (sem rede) → embutido aparece; publicar do Doc → após reload,
  texto atualizado, estrelas ★ intactas, cálculos de HP/CA inalterados.

## Fora de escopo

- Publicar seções novas no Firebase / novo nó por arquivo (decidido: mesmo `arc_rules.json`).
- `caBase` por natureza no Doc (não existe lá hoje).
- Sync de players/sessões do GM (já existe, via Firebase SDK, independente disto).
