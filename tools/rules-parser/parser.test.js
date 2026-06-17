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
