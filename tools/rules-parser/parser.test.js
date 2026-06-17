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

test('normalizeAction tolera + sem espaços e ação com barra', () => {
  assert.deepEqual(normalizeAction('reação+bônus'), { value: 'Reação+Bônus', known: true });
  assert.deepEqual(normalizeAction('reação+movimento'), { value: 'Movimento+Reação', known: true });
  assert.deepEqual(normalizeAction('padrão / completa'), { value: 'Padrão', known: true });
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

const { parseUltimateHeader } = require('./parser');

test('ultimate com limite e ação explícita (sem custo)', () => {
  const r = parseUltimateHeader('"Espírito Indomável" (1x por cena) (passiva):');
  assert.equal(r.name, 'Espírito Indomável');
  assert.equal(r.limit, '1x por cena');
  assert.equal(r.action, 'Passiva');
  assert.equal(r.cost, null);
});

test('ultimate com limite e custo em colchetes, ação implícita = Especial', () => {
  const r = parseUltimateHeader('"Tempestade de Aço" (1x por luta) [20S]:');
  assert.equal(r.name, 'Tempestade de Aço');
  assert.equal(r.limit, '1x por luta');
  assert.equal(r.cost, '20S');
  assert.equal(r.action, 'Especial');
});

test('ultimate com custo em parênteses', () => {
  const r = parseUltimateHeader('"Bastião" (1x por luta) (15S):');
  assert.equal(r.cost, '15S');
  assert.equal(r.limit, '1x por luta');
});

test('ultimate com custo multiplicador X*3S', () => {
  const r = parseUltimateHeader('"Fim do Combate" (1x por missão) (X*3S):');
  assert.equal(r.cost, 'X*3S');
  assert.equal(r.limit, '1x por missão');
});

test('linha sem aspas não é ultimate', () => {
  assert.equal(parseUltimateHeader('Foco no Alvo (passiva): +1 de dano'), null);
});

const { parseClasses } = require('./parser');
const { SAMPLE } = require('./fixtures');

test('parseClasses extrai classe geral com 5 skills + ultimate', () => {
  const { classes } = parseClasses(SAMPLE);
  const s = classes['Sobrevivente'];
  assert.equal(s.type, 'geral');
  assert.equal(s.skills.length, 5);
  assert.equal(s.skills[0].name, 'Instinto de Preservação');
  assert.equal(s.ultimate.name, 'Espírito Indomável');
  assert.equal(s.ultimate.limit, '1x por cena');
  assert.equal(s.ultimate.action, 'Passiva');
});

test('parseClasses associa classe específica à natureza pai', () => {
  const { classes } = parseClasses(SAMPLE);
  const t = classes['Titã'];
  assert.equal(t.type, 'especifica');
  assert.equal(t.natureza, 'Brutamontes');
  assert.equal(t.skills.length, 5);
  assert.equal(t.skills[1].action, 'Movimento+Reação');
  assert.equal(t.ultimate.name, 'Bastião');
  assert.equal(t.ultimate.cost, '15S');
});

test('parseClasses ignora intro fora de classe e não cria classe fantasma', () => {
  const { classes } = parseClasses(SAMPLE);
  assert.deepEqual(Object.keys(classes).sort(), ['Sobrevivente', 'Titã'].sort());
});

test('parseClasses emite warning para skill malformada dentro de classe', () => {
  const bad = [
    { heading: 'HEADING1', text: 'Classes' },
    { heading: 'HEADING3', text: 'Classes Gerais' },
    { heading: 'HEADING2', text: 'Combatente' },
    { heading: 'NORMAL', text: 'Foco Total (sei lá) faltou os dois-pontos aqui' },
  ];
  const { warnings } = parseClasses(bad);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Combatente/);
});

const { parseSubattrs } = require('./parser');
const { SAMPLE_SUBATTR } = require('./fixtures');

test('parseSubattrs: extrai skills por subatributo (Corpo/Mente/Alma)', () => {
  const { subattrs } = parseSubattrs(SAMPLE_SUBATTR);
  assert.equal(subattrs.forca.length, 3);
  assert.equal(subattrs.forca[0].name, 'Golpe Fortalecido');
  assert.equal(subattrs.forca[1].action, 'Reação');
  assert.equal(subattrs.vigor.length, 1);
  assert.equal(subattrs.conexao.length, 1);
  assert.equal(subattrs.conexao[0].name, 'Vínculo Astral');
});

test('parseSubattrs: marca lb e prefixa [LB] após "Limit break"', () => {
  const { subattrs } = parseSubattrs(SAMPLE_SUBATTR);
  const pf = subattrs.forca[2];
  assert.equal(pf.name, 'Ponto Fraco');
  assert.equal(pf.lb, true);
  assert.ok(pf.desc.startsWith('[LB] '));
  assert.equal(subattrs.forca[0].lb, undefined); // skill normal não tem lb
});

test('parseSubattrs: item com 2 skills na mesma string (quebra de linha interna) extrai ambas', () => {
  const paras = [
    { heading: 'HEADING1', text: 'Atributos' },
    { heading: 'HEADING2', text: 'Corpo' },
    { heading: 'NORMAL', text: 'Agilidade' },
    { heading: 'NORMAL', text: 'Nível 2 — Passo Ágil (passiva): desloca +1\nNível 3 — Ímpeto (livre) [2S]: ação bônus' },
  ];
  const { subattrs } = parseSubattrs(paras);
  assert.equal(subattrs.agilidade.length, 2);
  assert.equal(subattrs.agilidade[0].name, 'Passo Ágil');
  assert.equal(subattrs.agilidade[1].name, 'Ímpeto');
});

test('parseSubattrs: ignora texto narrativo da Alma e não cria subatributo fantasma', () => {
  const { subattrs, warnings } = parseSubattrs(SAMPLE_SUBATTR);
  assert.deepEqual(Object.keys(subattrs).sort(), ['conexao', 'forca', 'vigor']);
  assert.equal(warnings.length, 0);
});

const { diffClasses } = require('./parser');

test('diffClasses: sem mudanças → hasChanges false', () => {
  const c = { A: { type: 'geral', skills: [{ name: 'S1', action: 'Passiva', cost: null, desc: 'd' }], ultimate: { name: 'U', action: 'Especial', cost: '5S', limit: '1x', desc: 'u' } } };
  const d = diffClasses(c, JSON.parse(JSON.stringify(c)));
  assert.equal(d.hasChanges, false);
  assert.equal(d.rows.length, 0);
});

test('diffClasses: descrição de skill alterada (antes → depois)', () => {
  const a = { A: { type: 'geral', skills: [{ name: 'S1', action: 'Passiva', cost: null, desc: 'reduz 50%' }], ultimate: null } };
  const b = { A: { type: 'geral', skills: [{ name: 'S1', action: 'Passiva', cost: null, desc: 'reduz 33%' }], ultimate: null } };
  const d = diffClasses(a, b);
  assert.equal(d.hasChanges, true);
  const row = d.rows.find((r) => r.type === 'modified');
  assert.match(row.path, /A › S1 › desc/);
  assert.equal(row.old, 'reduz 50%');
  assert.equal(row.new, 'reduz 33%');
});

test('diffClasses: skill adicionada e removida', () => {
  const a = { A: { type: 'geral', skills: [{ name: 'Velha', action: 'Passiva', cost: null, desc: 'x' }], ultimate: null } };
  const b = { A: { type: 'geral', skills: [{ name: 'Nova', action: 'Bônus', cost: '2S', desc: 'y' }], ultimate: null } };
  const d = diffClasses(a, b);
  assert.ok(d.rows.some((r) => r.type === 'skill-added' && /Nova/.test(r.path)));
  assert.ok(d.rows.some((r) => r.type === 'skill-removed' && /Velha/.test(r.path)));
});

test('diffClasses: classe adicionada', () => {
  const d = diffClasses({}, { Nova: { type: 'geral', skills: [], ultimate: null } });
  assert.ok(d.rows.some((r) => r.type === 'class-added' && r.path === 'Nova'));
});

test('diffClasses: ultimate com custo alterado', () => {
  const a = { A: { type: 'geral', skills: [], ultimate: { name: 'U', action: 'Especial', cost: '20S', limit: '1x', desc: 'u' } } };
  const b = { A: { type: 'geral', skills: [], ultimate: { name: 'U', action: 'Especial', cost: '15S', limit: '1x', desc: 'u' } } };
  const d = diffClasses(a, b);
  const row = d.rows.find((r) => /ULT › cost/.test(r.path));
  assert.equal(row.old, '20S');
  assert.equal(row.new, '15S');
});
