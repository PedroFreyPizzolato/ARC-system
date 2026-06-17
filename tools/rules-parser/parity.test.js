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
vm.runInContext(pure + '\nthis.parseClasses = parseClasses;', ctx);

test('Ponte.gs parseClasses idêntico ao parser.js (anti-drift)', () => {
  assert.deepEqual(ctx.parseClasses(SAMPLE), ref.parseClasses(SAMPLE));
});
