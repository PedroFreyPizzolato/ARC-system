// Rank Up dos Títulos — lógica pura (sem DOM, sem estado).
// ATENÇÃO: as funções abaixo são espelhadas dentro de ARC_System_V3.html
// (as constantes já existem lá). Mudou uma, mude nas duas.
const RANK_TITLE_LIMITS = { C: 4, B: 3, A: 2, S: 1, Z: 1 };
const RANK_SKILL_COUNTS = { C: 1, B: 2, A: 3, S: 5, Z: 5 };
const RANK_LEVEL_REQ = { B: 4, A: 9, S: 16 };

const NEXT_RANK = { C: 'B', B: 'A', A: 'S' }; // S e Z não sobem

function isTitleComplete(t) {
  const qs = (t && t.quests) || [];
  return qs.length > 0 && qs.every(q => q.total > 0 && (q.cur || 0) >= q.total);
}

// Libera com o conjunto completo de títulos do Rank (C: 4), (limite − 1) deles
// concluídos e o nível do próximo Rank.
// mustDiscard > 0 quando sobram concluídos além do limite do novo Rank.
function rankUpStatus(rank, nivel, titles) {
  const next = NEXT_RANK[rank] || null;
  const have = (titles || []).length;
  const done = (titles || []).filter(isTitleComplete).length;
  if (!next) return { next, have, limit: RANK_TITLE_LIMITS[rank], haveAll: false, done, needed: 0, reqLevel: null, levelOk: false, ready: false, mustDiscard: 0 };
  const limit = RANK_TITLE_LIMITS[rank];
  const needed = limit - 1;
  const reqLevel = RANK_LEVEL_REQ[next];
  const levelOk = (nivel || 0) >= reqLevel;
  const haveAll = have >= limit;
  return { next, have, limit, haveAll, done, needed, reqLevel, levelOk, ready: haveAll && levelOk && done >= needed, mustDiscard: Math.max(0, done - RANK_TITLE_LIMITS[next]) };
}

// Devolve os novos títulos: incompletos somem, os de índice em discardIdx somem,
// os demais sobem de Rank com as skills completadas e as missões zeradas.
function applyRankUp(titles, rank, discardIdx) {
  const next = NEXT_RANK[rank];
  const s = rankUpStatus(rank, Infinity, titles);
  if (!next || !s.ready) throw new Error('Rank Up não liberado');
  const discard = new Set(discardIdx || []);
  if (discard.size !== s.mustDiscard || [...discard].some(i => !isTitleComplete(titles[i])))
    throw new Error(`Escolha ${s.mustDiscard} título(s) concluído(s) para descartar`);
  const nSkills = RANK_SKILL_COUNTS[next];
  return titles
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => isTitleComplete(t) && !discard.has(i))
    .map(({ t }) => {
      const skills = t.skills.map(sk => ({ ...sk }));
      for (let k = skills.length; k < nSkills; k++) skills.push({ name: `Skill ${k + 1}`, action: 'Passiva', cost: '', desc: '' });
      return { ...t, rank: next, skills, quests: [{ desc: '', total: 0, cur: 0 }] };
    });
}

module.exports = { NEXT_RANK, isTitleComplete, rankUpStatus, applyRankUp };
