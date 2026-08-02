# Grupos e subgrupos no Catálogo de NPCs — design

Data: 2026-08-01
Arquivos: `ARC_NPC_Catalog_V2.html`, `ARC_GM_Screen_V2.html`, `tools/npc-groups/`

## Problema

A sidebar do catálogo é uma lista plana de NPCs. Com dezenas de NPCs não há como
separar por facção, arco ou encontro.

## Modelo de dados

Lista plana, hierarquia por `parentId`, **máximo 2 níveis** (grupo → subgrupo):

```js
groups = [
  { id: 'grp_1_...', name: 'Facção Kaine', parentId: null, collapsed: false },
  { id: 'grp_2_...', name: 'Elite',        parentId: 'grp_1_...' }
]
npc.groupId = 'grp_2_...' | null   // null = "sem grupo"
```

Decisões:

- **`collapsed` mora no grupo.** Sem canal de persistência extra e o estado
  aberto/fechado sobrevive ao F5. Alternar colapso passa pelo mesmo `save()`
  que qualquer outra edição.
- **Ordem = posição no array.** Vale para grupos (`groups`) e para NPCs dentro
  do grupo (`npcs`). Sem campo `order`, sem reindexar. Mover troca o item com o
  irmão adjacente — irmão de grupo é quem tem o mesmo `parentId`, irmão de NPC é
  quem tem o mesmo `groupId`.
- **Só 2 níveis.** Subgrupo não recebe botão de criar subgrupo. O `select` da
  aba INFO também não oferece caminhos mais profundos.

## Persistência

- Solto: `localStorage['arc_npc_groups_v1']`.
- Embutido no GM Screen: `arc-npc-save` e `arc-npc-load` passam a carregar
  `{ npcs, groups }`. O GM guarda em `S.catalogGroups`, com o mesmo guard de
  `S.catalogNpcs` no `init()`.
- `groups` ausente → `[]`. Saves antigos (do GM ou do localStorage) continuam
  abrindo sem migração.

## Lógica pura (`tools/npc-groups/groups.js`)

Espelhada dentro do HTML, seguindo o padrão já usado no bloco de sync
("mudou uma, mude nas duas").

- `buildTree(groups, npcs)` → `[{ group, npcs, children:[{group, npcs}] }]` mais
  a lista de NPCs sem grupo. Grupo cujo `parentId` aponta para um id inexistente
  é tratado como raiz (órfão não desaparece).
- `removeGroup(groups, npcs, id)` → remove o grupo e seus subgrupos; todo NPC
  afetado volta para `groupId = null`. **Nunca apaga NPC.**
- `moveInSiblings(list, id, dir, parentKey)` → troca o item com o irmão
  anterior/seguinte; no-op na ponta. `moveGroup` e `moveNpc` são ele com
  `parentKey` `'parentId'` e `'groupId'`.

Todas retornam novas listas, sem mutar a entrada.

## UI

**Sidebar** — árvore. Cabeçalho por grupo (`▾ FACÇÃO KAINE (3)`), clique no
título colapsa. Controles no cabeçalho: `▲` `▼` mover, `＋` novo subgrupo (só em
grupos raiz), `✎` renomear, `✕` apagar. Cada card de NPC tem `▲` `▼` para
ordenar dentro do próprio grupo. Os controles ficam escondidos com `width:0`
fora do hover, senão espremem o nome. Apagar pede confirmação e avisa que os
NPCs vão para "sem grupo". NPCs sem grupo ficam numa seção `SEM GRUPO` no fim,
escondida quando vazia. Botão `+ NOVO GRUPO` acima do `+ NOVO NPC`.

**Aba INFO** — `select` "GRUPO" com `— Sem grupo —` e todos os grupos, subgrupo
exibido como `Facção Kaine › Elite`. Criação de grupo só na sidebar, então não
dá para criar duplicata por erro de digitação.

NPC novo nasce sem grupo.

## Testes

`tools/npc-groups/groups.test.js` (`node:test`): aninhamento de 2 níveis, órfão
vira raiz, cascata do delete solta os NPCs sem apagar nenhum, `moveGroup` e
`moveNpc` só trocam entre irmãos e são no-op na ponta, e a ordem do array é a
que a árvore devolve.

## Fora de escopo

Drag & drop, mais de 2 níveis.
