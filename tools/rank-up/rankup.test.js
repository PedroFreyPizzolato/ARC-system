const { test } = require('node:test');
const assert = require('node:assert');
const { isTitleComplete, rankUpStatus, applyRankUp } = require('./rankup');

const Q = (cur, total) => ({ desc: 'm', cur, total });
const T = (name, rank, quests, nSkills = 1) => ({
  name, rank, quests,
  skills: Array.from({ length: nSkills }, (_, i) => ({ name: `${name}-sk${i}`, action: 'Passiva', cost: '', desc: '' }))
});
const done = (name, rank = 'C') => T(name, rank, [Q(3, 3)]);
const open = (name, rank = 'C') => T(name, rank, [Q(1, 3)]);

test('título concluído = tem missão e todas com atual >= total > 0', () => {
  assert.equal(isTitleComplete(T('a', 'C', [Q(3, 3), Q(5, 2)])), true);
  assert.equal(isTitleComplete(T('b', 'C', [Q(3, 3), Q(1, 2)])), false);
  assert.equal(isTitleComplete(T('c', 'C', [])), false, 'sem missão não conta');
  assert.equal(isTitleComplete(T('d', 'C', [Q(0, 0)])), false, 'missão com total 0 não conta');
});

test('C→B libera com 3 de 4 concluídos e nível 4', () => {
  const titles = [done('a'), done('b'), done('c'), open('d')];
  const s = rankUpStatus('C', 4, titles);
  assert.deepEqual([s.next, s.needed, s.done, s.reqLevel, s.ready, s.mustDiscard], ['B', 3, 3, 4, true, 0]);
});

test('bloqueia por nível mesmo com missões concluídas', () => {
  const s = rankUpStatus('C', 3, [done('a'), done('b'), done('c'), open('d')]);
  assert.equal(s.levelOk, false);
  assert.equal(s.ready, false);
});

test('bloqueia com concluídos insuficientes (B→A precisa 2 de 3)', () => {
  const s = rankUpStatus('B', 20, [done('a', 'B'), open('b', 'B'), open('c', 'B')]);
  assert.deepEqual([s.needed, s.done, s.ready], [2, 1, false]);
});

test('todos concluídos → precisa descartar 1', () => {
  const s = rankUpStatus('A', 20, [done('a', 'A'), done('b', 'A')]);
  assert.deepEqual([s.next, s.ready, s.mustDiscard], ['S', true, 1]);
});

test('S e Z não sobem de Rank', () => {
  assert.equal(rankUpStatus('S', 99, [done('a', 'S')]).next, null);
  assert.equal(rankUpStatus('S', 99, [done('a', 'S')]).ready, false);
  assert.equal(rankUpStatus('Z', 99, [done('a', 'Z')]).ready, false);
});

test('aplicar: incompleto some, concluídos sobem, skills completam, missões zeram', () => {
  const titles = [done('a'), open('b'), done('c'), done('d')];
  const out = applyRankUp(titles, 'C', []);
  assert.deepEqual(out.map(t => t.name), ['a', 'c', 'd']);
  assert.ok(out.every(t => t.rank === 'B'));
  assert.deepEqual(out[0].skills.map(s => s.name), ['a-sk0', 'Skill 2'], 'mantém skill antiga e completa até 2');
  assert.deepEqual(out[0].quests, [{ desc: '', total: 0, cur: 0 }]);
  assert.equal(titles[0].rank, 'C', 'não muta a entrada (Desfazer depende disso)');
});

test('aplicar com todos concluídos descarta o escolhido', () => {
  const out = applyRankUp([done('a', 'A'), done('b', 'A')], 'A', [0]);
  assert.deepEqual(out.map(t => [t.name, t.rank, t.skills.length]), [['b', 'S', 5]]);
});

test('aplicar recusa descarte em quantidade errada', () => {
  assert.throws(() => applyRankUp([done('a', 'A'), done('b', 'A')], 'A', []));
  assert.throws(() => applyRankUp([done('a'), done('b'), done('c'), open('d')], 'C', [0]));
});

test('precisa ter o conjunto completo de títulos: 3 concluídos de 3 não sobe de C', () => {
  const s = rankUpStatus('C', 20, [done('a'), done('b'), done('c')]);
  assert.deepEqual([s.have, s.limit, s.haveAll, s.ready], [3, 4, false, false]);
  assert.throws(() => applyRankUp([done('a'), done('b'), done('c')], 'C', []));
});

test('conjunto completo vale para B→A (3) e A→S (2)', () => {
  assert.equal(rankUpStatus('B', 20, [done('a', 'B'), done('b', 'B')]).ready, false);
  assert.equal(rankUpStatus('A', 20, [done('a', 'A')]).ready, false);
  assert.equal(rankUpStatus('A', 20, [done('a', 'A'), open('b', 'A')]).ready, true);
});
