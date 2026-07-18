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
