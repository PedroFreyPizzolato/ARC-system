# Design — ARC sincronizado com o Doc "Sistema Intitulados" (Google Drive)

**Data:** 2026-06-16
**Status:** Aprovado para planejamento

---

## 1. Problema

O sistema de RPG "Intitulados" vive em um **Google Doc** ("Sistema Intitulados") onde o autor
escreve e mantém todas as regras. As ferramentas do projeto são 3 arquivos HTML autônomos
abertos por duplo clique (`file://`):

- `ARC_System_V2.html` — ficha do jogador
- `ARC_GM_Screen_V2.html` — tela do mestre
- `ARC_NPC_Catalog_V2.html` — catálogo de NPCs

Hoje as regras estão **duplicadas como objetos JavaScript embutidos** nesses HTMLs
(`CLASS_DATA`, `SUBATTR_SKILLS`, `NATURE_DATA`, `PERICIAS_DATA_*`, `STATUS_*`, etc.).

Toda vez que o autor muda uma regra no Doc (ex.: a descrição de uma skill passa de "50%" para
"33%"), ele precisa repetir o trabalho manualmente:

> editar o Doc → editar os HTMLs → baixar os arquivos novos → reenviar o ARC atualizado aos players

A dor é esse retrabalho manual e propenso a erro.

## 2. Objetivo

O autor edita **apenas o Doc**. As mudanças de regra chegam ao ARC dele e ao dos players
**sem editar HTML, sem rebaixar arquivo e sem reenviar nada**.

### Não-objetivos (fora de escopo)

- Não criar um novo lugar para documentar o sistema (o Doc continua sendo a fonte única).
- Não construir um editor de regras dentro do app.
- Não sincronizar a lore/prosa narrativa — apenas os dados que o ARC consome.
- Não mexer na sincronização de fichas GM↔jogador já existente (Firebase). Ela continua como está.

## 3. Decisões tomadas (durante o brainstorming)

| Decisão | Escolha |
|---|---|
| O que centralizar | As **regras do sistema** (não fichas, não os arquivos) |
| Fonte da verdade | O **Google Doc** "Sistema Intitulados" (já existente) |
| Onde as regras ficam para o app ler | **Firebase Realtime Database** (`intitulations`, já usado pelo projeto) |
| Como a sincronização dispara | **Botão "Publicar pro ARC"** no próprio Doc (mostra o que mudou antes de enviar) |
| Primeira entrega (V1) | Apenas **Classes** (skills + ultimates) |

Motivo de usar o Firebase como intermediário (e não ler o Drive direto): páginas abertas por
`file://` têm "origem nula" e o navegador bloqueia leitura confiável do Google Drive (CORS +
páginas de confirmação + necessidade de OAuth para escrita). O Firebase **já funciona em
`file://`** neste projeto — é o canal de nuvem comprovadamente compatível.

## 4. Arquitetura

```
┌──────────────────────┐   clica "Publicar pro ARC"   ┌─────────────────────────┐
│  Google Doc          │ ───────────────────────────► │  Google Apps Script     │
│  "Sistema Intitulados"│                              │  (a "ponte")            │
│  (fonte, editado pelo │                              │  - lê o Doc por seções  │
│   autor)             │                              │  - traduz p/ 4 campos   │
└──────────────────────┘                              │  - mostra preview       │
                                                       │  - PUT REST no Firebase │
                                                       └───────────┬─────────────┘
                                                                   │
                                          arc_rules.json (PUT)      ▼
                                              ┌─────────────────────────────────┐
                                              │  Firebase Realtime DB            │
                                              │  intitulations → /arc_rules      │
                                              └───────────┬──────────────────────┘
                                       fetch GET (boot)   │
              ┌────────────────────────────────┬──────────┴───────────┐
              ▼                                 ▼                      ▼
   ARC_System_V2.html              ARC_GM_Screen_V2.html      ARC_NPC_Catalog_V2.html
   (loader: Firebase → cache → embutido como reserva offline)
```

### Peça 1 — A ponte (Google Apps Script vinculado ao Doc)

- Adiciona um menu `ARC ▸ Publicar pro ARC` (via `onOpen` + `DocumentApp.getUi().createMenu`).
- Ao acionar:
  1. Percorre o corpo do Doc usando o **nível de heading** de cada parágrafo
     (`getHeading()`) como mapa de seções, e o **texto plano** (`getText()`) do parágrafo
     como conteúdo (o texto plano já descarta a formatação markdown/negrito, deixando
     `Nome (ação) [custo]: descrição` limpo).
  2. Traduz cada skill para `{ name, action, cost, desc }` e monta o objeto `arc_rules`.
  3. Abre um diálogo (`HtmlService`) com o **resumo das mudanças** vs. o `arc_rules` atual
     (lido por GET REST): adicionadas / alteradas / removidas, e uma lista de
     **⚠️ linhas não reconhecidas** (fora do padrão) — para o autor corrigir no Doc.
  4. Só ao confirmar, faz `UrlFetchApp.fetch(..., {method:'put', payload: JSON})` em
     `https://intitulations-default-rtdb.firebaseio.com/arc_rules.json`.

### Peça 2 — O Firebase (já existente)

- Novo nó `/arc_rules` no banco `intitulations-default-rtdb`. Nenhuma conta nova.
- Convive com o `/arc_campaigns` (fichas) que já existe; não há interferência.

### Peça 3 — O carregador (loader) nos 3 ARCs

No boot de cada HTML, **antes de renderizar**:

1. `fetch('https://intitulations-default-rtdb.firebaseio.com/arc_rules.json')` (REST, sem SDK).
2. **Sucesso** → usa as regras da nuvem e grava cópia em `localStorage` (`arc_rules_cache`).
3. **Falha/offline** → usa a última cópia de `localStorage`.
4. **Nunca sincronizou** → usa os **dados embutidos atuais** (rede de segurança).

Implementação cirúrgica sugerida: renomear o `const CLASS_DATA` atual para
`CLASS_DATA_EMBEDDED`, declarar `let CLASS_DATA = CLASS_DATA_EMBEDDED`, e no boot fazer
`CLASS_DATA = (regrasCarregadas?.classes) || CLASS_DATA_EMBEDDED`. Assim **nenhum outro ponto
do código que já usa `CLASS_DATA` precisa mudar**. O `init` passa a ser `async` para aguardar
o `fetch` antes de montar a UI (timeout curto, ex. 4s, para não travar offline).

## 4.1 Onde as regras vivem hoje (mapeamento confirmado por pesquisa)

| Arquivo | Usa `CLASS_DATA`? | Estruturas de regras embutidas | V1 toca? |
|---|---|---|---|
| `ARC_System_V2.html` | **Sim** (`const`, linhas 2613–2740; 11 usos em `renderClasseGeral`/`renderClasseEsp`/`renderMulticlasse`) | `CLASS_DATA`, `SUBATTR_SKILLS(_ALMA)`, `NATURE_DATA`, `PERICIAS_DATA_*`, `STATUS_*`, `ACTIONS_LIST` | **Sim** |
| `ARC_GM_Screen_V2.html` | **Não** | só configs simples (`SNEG`, `SPOS`, `NATS`, `ACTS`…); **nenhuma** definição de classe com skills | **Não** |
| `ARC_NPC_Catalog_V2.html` | **Não** — mas tem cópia própria das classes na variável **`CL`** (linha 325), além de `NATURE_DATA`/`SA`/`PERICIAS` duplicados | `CL`, `CL_GERAL`, `CL_ESP_BY_NAT`, `NATURE_DATA`, `SA`, `SA_ALMA`, `STATUS_*`, `PERICIAS` | **A decidir** |

Consequência: a V1 (Classes) é **cirúrgica em um único arquivo** (`ARC_System_V2.html`). O
`ARC_NPC_Catalog_V2.html` mantém uma cópia separada das classes (`CL`, formato próprio) usada
para montar NPCs; sincronizá-la é desejável mas é trabalho adicional com outro formato — tratado
como decisão de escopo (ver §7).

Nota técnica sobre o parser: no Apps Script, `Paragraph.getText()` devolve **texto plano, sem
marcação**. Os `**`, `***`, `\[`, `\->` vistos no arquivo `sistema-extraido.md` são artefato da
exportação markdown do Drive — no Doc real o parser recebe `Nome (ação) [custo]: descrição` já
limpo. Variações que **realmente** exigem tratamento: custo com seta (`1S -> 8S`), ultimate com
custo em `()` ou `[]` e notação `X*3S`, ação com `-> fala`, uma skill que usa travessão em vez de
parênteses (`Aceleração Tática – (5S)`), e skills cuja descrição segue em linhas/bullets
subsequentes.

## 5. Convenção de formato no Doc (assumida pelo parser)

O Doc **já segue** este padrão; a sincronização depende de mantê-lo consistente.

### Estrutura de seções (Classes)

```
# Classes
### Classes Gerais            → marca modo "geral"
## Sobrevivente               → uma classe geral
**Skill (ação) [custo]:** descrição
...
### Classes Específicas       → marca modo "específica"
## Brutamontes                → uma NATUREZA (nome ∈ {Brutamontes, Guerreiro, Atleta, Velocista})
### Titã                      → classe específica (natureza = Brutamontes)
...
```

Como os níveis de heading são irregulares (uma classe geral é `##`, mas uma classe específica
é `###`), o parser usa uma **máquina de estados**: os títulos "Classes Gerais"/"Classes
Específicas" trocam o modo, e os 4 nomes de Natureza conhecidos distinguem "natureza" de
"classe".

### Linha de skill

`Nome da Skill (ação) [custo]: descrição`

- `(ação)` — obrigatório. Ex.: `(passiva)`, `(completo)`, `(bônus)`, `(reação + bônus)`.
- `[custo]` — opcional (passivas não têm). Ex.: `[5S]`, `[1S -> 8S]`.
- Exemplos reais do Doc:
  - `Instinto de Preservação (passiva): ...` → cost = `null`
  - `Improvisador Nato (completo) [5S]: ...` → cost = `5S`

### Linha de ultimate

`"Nome da Ultimate" (limite) (ação) [custo]:` seguida da descrição no parágrafo seguinte.

- Nome entre **aspas**.
- Os parênteses/colchetes vêm em ordem variável; o parser **classifica cada grupo**:
  contém "x por" → `limit`; parece custo (tem dígitos/`S`) → `cost`; senão → `action`.
- Ex.: `"Espírito Indomável" (1x por cena) (passiva):` → limit=`1x por cena`, action=`passiva`.

### Normalização de `action`

O Doc usa minúsculas e variações (`completo`, `reação + bônus`); o ARC espera valores fixos
de `ACTIONS_LIST` (`Completa`, `Reação+Bônus`, ...). O parser aplica uma **tabela de
normalização** e, se uma ação não casar com a lista do ARC, marca a linha como ⚠️ no preview.

## 6. Modelo de dados `arc_rules` (no Firebase)

V1 grava só `classes`; o formato espelha o `CLASS_DATA` atual para encaixar sem mudar a UI.

```json
{
  "_version": 1,
  "_updatedAt": 1750000000000,
  "classes": {
    "Sobrevivente": {
      "type": "geral",
      "skills": [
        { "name": "Instinto de Preservação", "action": "Passiva", "cost": null, "desc": "..." }
      ],
      "ultimate": { "name": "Espírito Indomável", "action": "Passiva", "cost": null, "limit": "1×/cena", "desc": "..." }
    },
    "Titã": {
      "type": "especifica", "natureza": "Brutamontes",
      "skills": [ /* ... */ ],
      "ultimate": { /* ... */ }
    }
  }
}
```

## 7. Escopo

### V1 (esta entrega)
- Apps Script: parser de **Classes** + preview de mudanças + publicação no Firebase.
- Firebase: nó `/arc_rules` com `classes`.
- Loader de `classes` **apenas no `ARC_System_V2.html`** — confirmado pela pesquisa que é o
  **único** dos 3 HTMLs que usa `CLASS_DATA` (ver §4.1). Fallback Firebase → cache → embutido.
- Os players recebem o HTML com o loader **uma última vez**; a partir daí, mudanças de classe
  chegam só via "Publicar".

### V2 (futuro, mesmo mecanismo)
- Estender o parser e o loader para: Naturezas, Condições/efeitos, Perícias, Ações e
  Habilidades de subatributo (Corpo/Mente/Alma). Cada uma já tem formato consistente
  verificado no Doc.

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Parser frágil a digitação fora do padrão | O preview lista linhas ⚠️ **não reconhecidas**; nada entra errado em silêncio. Publicação é manual e confirmada. |
| Regra traduzida errada chega aos players | Preview com diff antes de publicar; loader sempre tem cache + embutido para reverter. |
| Firebase aberto (sem auth) — alguém poderia sobrescrever `/arc_rules` | Risco baixo para um grupo de RPG; cache/embutido permitem restaurar. Reforço opcional futuro (regra de validação ou token de escrita). |
| `fetch` lento/offline trava o boot | Timeout curto (~4s) no loader; cai para cache/embutido. |
| Info de Natureza espalhada (buff/debuff em "Naturezas"; hp/sta em "Status") | Tratado só na V2; o parser junta as duas seções por nome de natureza. |

## 9. Critérios de sucesso (verificáveis)

1. Rodar "Publicar pro ARC" sobre o Doc atual gera um `arc_rules.classes` com as **14 classes**
   (6 gerais + 8 específicas), cada uma com 5 skills + 1 ultimate, campos `action`/`cost`
   preenchidos e válidos, e **zero** avisos ⚠️ inesperados.
   **Atenção:** o `CLASS_DATA` embutido de hoje é uma versão **condensada e parcialmente
   desatualizada** do Doc — descrições resumidas (embutido: "resiste com 1 de vida sem destruir
   membro"; Doc: "você além de resistir com 1 de vida, não tem um membro destruído") e até nomes
   divergentes (embutido: "Hackear Equipamentos"; Doc: "Hackear árvores"). Logo a primeira
   publicação **NÃO** dá diff vazio: o preview **mostrará diferenças reais**, e o resultado
   esperado é o ARC passar a refletir o **Doc** (a fonte). A validação é **estrutural** (14
   classes × 5 skills + ultimate, nomes/ações coerentes), não comparação literal com o embutido.
2. Alterar uma descrição de skill no Doc (ex.: "50%" → "33%"), publicar, e **reabrir um ARC**
   mostra a descrição nova — **sem editar nenhum HTML**.
3. Abrir um ARC **sem internet** continua funcionando com as regras (cache ou embutido).
4. Uma linha de skill digitada fora do padrão aparece como ⚠️ no preview e **não** corrompe as
   regras publicadas.

## 10. Evolução: quando é preciso mexer no código?

Há três tipos de mudança, com custos bem diferentes:

**A. Mudar conteúdo dentro do formato atual → ZERO código.**
Trocar uma descrição (50% → 33%), mudar custo/ação, adicionar/remover skills, criar uma classe
nova seguindo o padrão `## Nome` + linhas de skill. O parser já entende; é o caso do dia a dia.

**B. Mudar a CONVENÇÃO de escrita → ajuste só no parser.**
Se você decidir escrever as skills de outro jeito (ex.: trocar `Nome (ação) [custo]:` por outro
formato, ou marcar ultimates de forma diferente), só a função de tradução no Apps Script precisa
de ajuste. **O `fetch`/loader nos HTMLs NÃO muda** — ele apenas lê um JSON pronto, independente
de como o Doc foi escrito. O ajuste é localizado e feito uma vez.

**C. Mudar a ESTRUTURA do sistema (conceitos novos) → você mexeria no ARC de qualquer forma.**
Ex.: adicionar um 4º atributo, criar "subclasses", uma mecânica nova com campos que o ARC não
possui. Aqui o próprio app precisa de UI/lógica nova — isso independe de existir sincronização.
O parser apenas acompanha a extensão.

**Degradação segura (o mais importante):** uma mudança de formato que o parser não entenda **não
quebra os ARCs dos players no escuro**. As linhas fora do padrão aparecem como ⚠️ no preview, e
como a publicação é manual e confirmada, você não publica algo quebrado. Mesmo que publicasse, o
loader mantém cache + dados embutidos como reserva. Pior caso: "o preview avisou → ajustamos o
parser → republica".

**Plano B (se o formato um dia ficar muito livre):** trocar o parser determinístico por tradução
assistida por IA — um LLM reinterpreta o Doc a cada publicação, tolerando variações de escrita.
Mais robusto a formato solto, porém com custo/dependência de API (e ainda com revisão no
preview). Fora do escopo agora; registrado como caminho de evolução.
```