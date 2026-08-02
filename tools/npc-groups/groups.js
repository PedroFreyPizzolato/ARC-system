// Grupos/subgrupos do Catálogo de NPCs — lógica pura (sem DOM, sem estado).
// Hierarquia de no máximo 2 níveis: grupo raiz (parentId null) → subgrupo.
// A ordem dos grupos é a própria posição no array.
// ATENÇÃO: espelhado dentro de ARC_NPC_Catalog_V2.html. Mudou uma, mude nas duas.

// Monta { roots:[{group, npcs, children:[{group, npcs}]}], ungrouped:[npc] }.
// Grupo cujo pai não existe (ou que estaria no 3º nível) é promovido a raiz,
// para que nenhum NPC suma da árvore.
function buildTree(groups, npcs) {
  const list = Array.isArray(groups) ? groups : [];
  const items = Array.isArray(npcs) ? npcs : [];
  const byId = new Map(list.map(g => [g.id, g]));
  const isRoot = g => { const p = byId.get(g.parentId); return !p || !!p.parentId; };
  const npcsOf = id => items.filter(n => n.groupId === id);
  const roots = list.filter(isRoot).map(g => ({
    group: g,
    npcs: npcsOf(g.id),
    children: list.filter(c => !isRoot(c) && c.parentId === g.id).map(c => ({ group: c, npcs: npcsOf(c.id) }))
  }));
  return { roots, ungrouped: items.filter(n => !byId.has(n.groupId)) };
}

// Remove o grupo e seus subgrupos; NPCs afetados voltam para groupId null.
// Nunca apaga NPC. Retorna listas novas.
function removeGroup(groups, npcs, id) {
  const list = Array.isArray(groups) ? groups : [];
  const doomed = new Set([id]);
  list.forEach(g => { if (g.parentId === id) doomed.add(g.id); });
  return {
    groups: list.filter(g => !doomed.has(g.id)),
    npcs: (Array.isArray(npcs) ? npcs : []).map(n => doomed.has(n.groupId) ? { ...n, groupId: null } : n)
  };
}

// Troca o item de lugar com o irmão anterior (dir -1) ou seguinte (dir +1),
// sendo irmão quem compartilha o mesmo pai (`parentKey`). No-op na ponta ou se
// o id não existe. Retorna lista nova.
function moveInSiblings(list, id, dir, parentKey) {
  const out = (Array.isArray(list) ? list : []).slice();
  const i = out.findIndex(x => x.id === id);
  if (i < 0) return out;
  const parent = out[i][parentKey] || null;
  const sibs = out.map((x, idx) => idx).filter(idx => (out[idx][parentKey] || null) === parent);
  const target = sibs[sibs.indexOf(i) + dir];
  if (target === undefined) return out;
  const tmp = out[i]; out[i] = out[target]; out[target] = tmp;
  return out;
}
function moveGroup(groups, id, dir) { return moveInSiblings(groups, id, dir, 'parentId'); }
function moveNpc(npcs, id, dir) { return moveInSiblings(npcs, id, dir, 'groupId'); }

module.exports = { buildTree, removeGroup, moveGroup, moveNpc };
