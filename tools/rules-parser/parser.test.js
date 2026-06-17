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
