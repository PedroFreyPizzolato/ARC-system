const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ref = require('./parser');
const { SAMPLE, SAMPLE_SUBATTR, SAMPLE_STATUS, SAMPLE_NATURES, SAMPLE_SYSTEMS } = require('./fixtures');

// Extrai as funções puras coladas em apps-script/Ponte.gs (entre os marcadores de cópia)
// e roda num contexto isolado, para garantir que NÃO divergiu de parser.js.
const gsPath = path.join(__dirname, '..', '..', 'apps-script', 'Ponte.gs');
const gs = fs.readFileSync(gsPath, 'utf8');
let pure = gs.split('// ---- INÍCIO cópia')[1].split('// ---- FIM cópia')[0];
pure = pure.slice(pure.indexOf('\n') + 1); // descarta o resto da linha do marcador de início
const ctx = {};
vm.createContext(ctx);
vm.runInContext(pure + '\nthis.parseClasses = parseClasses; this.diffClasses = diffClasses; this.parseSubattrs = parseSubattrs; this.parseStatus = parseStatus; this.parseNatures = parseNatures; this.parseSystems = parseSystems;', ctx);

test('Ponte.gs parseClasses idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseClasses(SAMPLE), ref.parseClasses(SAMPLE));
});

test('Ponte.gs parseSubattrs idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseSubattrs(SAMPLE_SUBATTR), ref.parseSubattrs(SAMPLE_SUBATTR));
});

test('Ponte.gs parseStatus idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseStatus(SAMPLE_STATUS), ref.parseStatus(SAMPLE_STATUS));
});

test('Ponte.gs parseNatures idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseNatures(SAMPLE_NATURES), ref.parseNatures(SAMPLE_NATURES));
});

test('Ponte.gs parseSystems idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseSystems(SAMPLE_SYSTEMS), ref.parseSystems(SAMPLE_SYSTEMS));
});

test('Ponte.gs diffClasses idêntico ao parser.js (anti-drift)', () => {
  const a = ref.parseClasses(SAMPLE).classes;
  const b = JSON.parse(JSON.stringify(a));
  const k = Object.keys(b)[0];
  b[k].skills[0].desc = 'ALTERADO'; // força uma mudança para gerar diff
  delete b[Object.keys(b)[1]]; // remove uma classe
  assert.deepEqual(ctx.diffClasses(a, b), ref.diffClasses(a, b));
});
