const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ref = require('./parser');
const { SAMPLE } = require('./fixtures');

// Extrai as funções puras coladas em apps-script/Ponte.gs (entre os marcadores de cópia)
// e roda num contexto isolado, para garantir que NÃO divergiu de parser.js.
const gsPath = path.join(__dirname, '..', '..', 'apps-script', 'Ponte.gs');
const gs = fs.readFileSync(gsPath, 'utf8');
let pure = gs.split('// ---- INÍCIO cópia')[1].split('// ---- FIM cópia')[0];
pure = pure.slice(pure.indexOf('\n') + 1); // descarta o resto da linha do marcador de início
const ctx = {};
vm.createContext(ctx);
vm.runInContext(pure + '\nthis.parseClasses = parseClasses; this.diffClasses = diffClasses;', ctx);

test('Ponte.gs parseClasses idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseClasses(SAMPLE), ref.parseClasses(SAMPLE));
});

test('Ponte.gs diffClasses idêntico ao parser.js (anti-drift)', () => {
  const a = ref.parseClasses(SAMPLE).classes;
  const b = JSON.parse(JSON.stringify(a));
  const k = Object.keys(b)[0];
  b[k].skills[0].desc = 'ALTERADO'; // força uma mudança para gerar diff
  delete b[Object.keys(b)[1]]; // remove uma classe
  assert.deepEqual(ctx.diffClasses(a, b), ref.diffClasses(a, b));
});
