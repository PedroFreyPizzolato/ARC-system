const { test } = require('node:test');
const assert = require('node:assert');
const { buildTree, removeGroup, moveGroup, moveNpc } = require('./groups');

const G = (id, parentId) => ({ id, name: id, parentId: parentId || null });
const N = (id, groupId) => ({ id, groupId: groupId || null });

test('monta árvore de 2 níveis com os NPCs em cada nó', () => {
  const groups = [G('a'), G('a1', 'a'), G('b')];
  const npcs = [N('n1', 'a'), N('n2', 'a1'), N('n3', 'b'), N('n4')];
  const { roots, ungrouped } = buildTree(groups, npcs);
  assert.deepEqual(roots.map(r => r.group.id), ['a', 'b']);
  assert.deepEqual(roots[0].npcs.map(n => n.id), ['n1']);
  assert.deepEqual(roots[0].children.map(c => c.group.id), ['a1']);
  assert.deepEqual(roots[0].children[0].npcs.map(n => n.id), ['n2']);
  assert.deepEqual(ungrouped.map(n => n.id), ['n4']);
});

test('grupo órfão (pai inexistente) vira raiz em vez de sumir', () => {
  const { roots } = buildTree([G('x', 'apagado')], [N('n1', 'x')]);
  assert.deepEqual(roots.map(r => r.group.id), ['x']);
  assert.deepEqual(roots[0].npcs.map(n => n.id), ['n1']);
});

test('neto (3º nível) vira raiz — nenhum NPC some da árvore', () => {
  const groups = [G('a'), G('a1', 'a'), G('a2', 'a1')];
  const { roots, ungrouped } = buildTree(groups, [N('n1', 'a2')]);
  const vistos = roots.flatMap(r => [...r.npcs, ...r.children.flatMap(c => c.npcs)]);
  assert.deepEqual([...vistos.map(n => n.id), ...ungrouped.map(n => n.id)], ['n1']);
});

test('NPC apontando para grupo inexistente cai em sem-grupo', () => {
  const { ungrouped } = buildTree([G('a')], [N('n1', 'fantasma')]);
  assert.deepEqual(ungrouped.map(n => n.id), ['n1']);
});

test('árvore vazia não quebra', () => {
  assert.deepEqual(buildTree(null, null), { roots: [], ungrouped: [] });
});

test('remover grupo leva os subgrupos e solta os NPCs sem apagar nenhum', () => {
  const groups = [G('a'), G('a1', 'a'), G('b')];
  const npcs = [N('n1', 'a'), N('n2', 'a1'), N('n3', 'b')];
  const r = removeGroup(groups, npcs, 'a');
  assert.deepEqual(r.groups.map(g => g.id), ['b']);
  assert.equal(r.npcs.length, 3);
  assert.deepEqual(r.npcs.map(n => n.groupId), [null, null, 'b']);
});

test('remover não muta as listas originais', () => {
  const groups = [G('a')];
  const npcs = [N('n1', 'a')];
  removeGroup(groups, npcs, 'a');
  assert.equal(groups.length, 1);
  assert.equal(npcs[0].groupId, 'a');
});

test('mover troca só com irmão de mesmo pai', () => {
  const groups = [G('a'), G('a1', 'a'), G('b')];
  assert.deepEqual(moveGroup(groups, 'b', -1).map(g => g.id), ['b', 'a1', 'a']);
  assert.deepEqual(moveGroup(groups, 'a', 1).map(g => g.id), ['b', 'a1', 'a']);
});

test('mover é no-op na ponta e para id inexistente', () => {
  const groups = [G('a'), G('b')];
  assert.deepEqual(moveGroup(groups, 'a', -1).map(g => g.id), ['a', 'b']);
  assert.deepEqual(moveGroup(groups, 'b', 1).map(g => g.id), ['a', 'b']);
  assert.deepEqual(moveGroup(groups, 'zzz', 1).map(g => g.id), ['a', 'b']);
});

test('mover subgrupo não mexe nos grupos raiz', () => {
  const groups = [G('a'), G('a1', 'a'), G('a2', 'a'), G('b')];
  assert.deepEqual(moveGroup(groups, 'a2', -1).map(g => g.id), ['a', 'a2', 'a1', 'b']);
});

test('mover NPC troca só com NPC do mesmo grupo', () => {
  const npcs = [N('n1', 'a'), N('n2', 'b'), N('n3', 'a')];
  assert.deepEqual(moveNpc(npcs, 'n3', -1).map(n => n.id), ['n3', 'n2', 'n1']);
  assert.deepEqual(moveNpc(npcs, 'n1', 1).map(n => n.id), ['n3', 'n2', 'n1']);
});

test('mover NPC é no-op na ponta do grupo e para id inexistente', () => {
  const npcs = [N('n1', 'a'), N('n2', 'b'), N('n3', 'a')];
  assert.deepEqual(moveNpc(npcs, 'n1', -1).map(n => n.id), ['n1', 'n2', 'n3']);
  assert.deepEqual(moveNpc(npcs, 'n3', 1).map(n => n.id), ['n1', 'n2', 'n3']);
  assert.deepEqual(moveNpc(npcs, 'n2', -1).map(n => n.id), ['n1', 'n2', 'n3']);
  assert.deepEqual(moveNpc(npcs, 'zzz', 1).map(n => n.id), ['n1', 'n2', 'n3']);
});

test('NPCs sem grupo também se ordenam entre si', () => {
  const npcs = [N('n1'), N('n2', 'a'), N('n3')];
  assert.deepEqual(moveNpc(npcs, 'n3', -1).map(n => n.id), ['n3', 'n2', 'n1']);
});

test('mover NPC não muta a lista original', () => {
  const npcs = [N('n1', 'a'), N('n2', 'a')];
  moveNpc(npcs, 'n2', -1);
  assert.deepEqual(npcs.map(n => n.id), ['n1', 'n2']);
});

test('a ordem do array é a ordem que a árvore devolve', () => {
  const npcs = [N('n1', 'a'), N('n2', 'a')];
  const movidos = moveNpc(npcs, 'n2', -1);
  assert.deepEqual(buildTree([G('a')], movidos).roots[0].npcs.map(n => n.id), ['n2', 'n1']);
});
