const { test } = require('node:test');
const assert = require('node:assert');
const { resolveClassData } = require('./resolve');

const EMB = { Sobrevivente: { type: 'geral', skills: [], ultimate: null } };
const REM = { Combatente: { type: 'geral', skills: [], ultimate: null } };
const CACHE = { Tático: { type: 'geral', skills: [], ultimate: null } };

test('usa remote quando presente', () => assert.equal(resolveClassData(REM, CACHE, EMB), REM));
test('cai para cache quando remote vazio/nulo', () => {
  assert.equal(resolveClassData(null, CACHE, EMB), CACHE);
  assert.equal(resolveClassData({}, CACHE, EMB), CACHE);
});
test('cai para embedded quando remote e cache ausentes', () => {
  assert.equal(resolveClassData(null, null, EMB), EMB);
  assert.equal(resolveClassData({}, {}, EMB), EMB);
});
