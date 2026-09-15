// Ferramenta de verificação: roda o parser contra um Doc real exportado em markdown.
// Converte o markdown (com **negrito**, \[escapes\]) em parágrafos {heading,text}
// limpos — simulando o que Apps Script Paragraph.getText() devolve — e roda parseClasses.
//
// Uso: node tools/rules-parser/verify-doc.js <caminho-do-doc-extraido.md>
const fs = require('fs');
const { parseClasses, parseSubattrs, parseStatus, parseNatures, parseSystems } = require('./parser');

const path = process.argv[2];
if (!path) { console.error('uso: node verify-doc.js <arquivo.md>'); process.exit(1); }

function clean(s) {
  return s
    .replace(/\*\*\*/g, '').replace(/\*\*/g, '')      // negrito/itálico markdown
    .replace(/\\([[\]\-*"'>_])/g, '$1')               // desescapar \[ \] \- \* \" \' \> \_
    .replace(/\\/g, '')
    .trim();
}

const paras = [];
for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
  const line = raw.replace(/\s+$/, '');
  if (!line.trim()) continue;
  let m;
  if ((m = line.match(/^###\s+(.*)$/))) paras.push({ heading: 'HEADING3', text: clean(m[1]) });
  else if ((m = line.match(/^##\s+(.*)$/))) paras.push({ heading: 'HEADING2', text: clean(m[1]) });
  else if ((m = line.match(/^#\s+(.*)$/))) paras.push({ heading: 'HEADING1', text: clean(m[1]) });
  else if (/^\|.*\|$/.test(line.trim())) {
    const cells = line.trim().slice(1, -1).split('|').map((c) => clean(c));
    if (cells.every((c) => /^[:\-\s]*$/.test(c))) continue; // separador do markdown
    paras.push({ heading: 'NORMAL', text: cells.join(' | '), cells });
  }
  else paras.push({ heading: 'NORMAL', text: clean(line.replace(/^\s*[-*]\s+/, '')) });
}

const { classes, warnings } = parseClasses(paras);
const names = Object.keys(classes);
console.log('Classes extraídas:', names.length);
for (const n of names) {
  const c = classes[n];
  console.log(`  - ${n} [${c.type}${c.natureza ? '/' + c.natureza : ''}] skills=${c.skills.length} ult=${c.ultimate ? c.ultimate.name : 'NENHUMA'}`);
}
console.log('\nAvisos (classes):', warnings.length);
warnings.forEach((w) => console.log('  ' + w));

const sub = parseSubattrs(paras);
console.log('\nSubatributos extraídos:', Object.keys(sub.subattrs).length, '(esperado 8)');
for (const k of Object.keys(sub.subattrs)) {
  const lst = sub.subattrs[k];
  console.log(`  - ${k}: ${lst.length} skills (${lst.filter((s) => s.lb).length} LB)`);
}
console.log('Avisos (subattr):', sub.warnings.length);
sub.warnings.forEach((w) => console.log('  ' + w));

const st = parseStatus(paras);
console.log('\nStatus (naturezas com Vida/Stamina):', Object.keys(st.natures).length, '(esperado 4)');
for (const n of Object.keys(st.natures)) {
  console.log(`  - ${n}:`);
  console.log(`      hp:  ${st.natures[n].hp}`);
  console.log(`      sta: ${st.natures[n].sta}`);
}

const nt = parseNatures(paras);
console.log('\nNaturezas (buff/debuff/hab. única):', Object.keys(nt.natures).length, '(esperado 4)');
for (const n of Object.keys(nt.natures)) {
  const x = nt.natures[n];
  console.log(`  - ${n}: buff=${x.buff ? 'ok' : '—'} debuff=${x.debuff ? 'ok' : '—'} hab=${x.habUnica ? x.habUnica.name + ' (' + x.habUnica.action + '/' + x.habUnica.cost + ')' : '—'}`);
}
console.log('Avisos (naturezas):', nt.warnings.length);
nt.warnings.forEach((w) => console.log('  ' + w));

console.log('\nSanidade (faixas da tabela):', st.sanity.length, '(esperado 6)');
st.sanity.forEach((f) => console.log(`  - ${f.label} [${f.min}..${f.max === null ? '+' : f.max}] ${f.desc}`));

const sy = parseSystems(paras);
const dur = sy.systems.durabilidade;
console.log('\nDurabilidade:', dur ? `${dur.items.length} itens (esperado 3)` : 'NAO ENCONTRADA');
if (dur) {
  console.log('  intro:', dur.intro);
  dur.items.forEach((i) => console.log(`  - ${i.name}: ${i.desc}`));
}
