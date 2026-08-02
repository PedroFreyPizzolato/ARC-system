// Recorte real do Doc "Sistema Intitulados" (já como texto plano, igual ao que
// Apps Script Paragraph.getText() devolve — sem marcação markdown).
const N = (text) => ({ heading: 'NORMAL', text });
const H1 = (text) => ({ heading: 'HEADING1', text });
const H2 = (text) => ({ heading: 'HEADING2', text });
const H3 = (text) => ({ heading: 'HEADING3', text });

const SAMPLE = [
  H1('Classes'),
  N('Nível 1 só é possível escolher classes gerais...'),
  H3('Classes Gerais'),
  H2('Sobrevivente'),
  N('Instinto de Preservação (passiva): Após sofrer Dano Massivo pela primeira vez na cena, você além de resistir com 1 de vida, não tem um membro destruído'),
  N('Improvisador Nato (completo) [5S]: Você pode improvisar uma arma.'),
  N('Rastreador (bônus) [3S]: Teste de investigação com vantagem.'),
  N('Adaptação Rápida (passiva): Após receber um DoT pela terceira vez na cena resiste.'),
  N('Força do Desespero (passiva): Com menos de 33% da vida, +2 em força ou agilidade.'),
  N('"Espírito Indomável" (1x por cena) (passiva):'),
  N('Quando reduzido a 0 de vida pela primeira vez você se levanta com 33% da vida.'),
  H3('Classes Específicas'),
  H2('Brutamontes'),
  H3('Titã'),
  N('Pele de aço (passiva): Sua redução de dano aumenta 50%.'),
  N('Muralha viva (reação + movimento) [5S]: Entra na frente do ataque por um aliado.'),
  N('Pés firmes (passiva): Imune a controle de grupo.'),
  N('Recuperação rápida (passiva): Cura 10% por turno sem ser atacado.'),
  N('Imposição física (livre) [6S]: Inimigos com menos Corpo ficam amedrontados.'),
  N('"Bastião" (1x por luta) (15S):'),
  N('Por 3 rodadas você fica imóvel e ganha 90% de redução.'),
];

// Recorte real da seção "# Atributos" (subatributos = parágrafos em negrito; skills em listas
// com prefixo "Nível N —"; "Limit break" marca lb; a Alma tem texto narrativo a ignorar).
const SAMPLE_SUBATTR = [
  H1('Atributos'),
  N('Nível 0 você começa com 0 pontos em todos os atributos e tem 1 ponto para distribuir'),
  H2('Corpo'),
  N('Força'),
  N('Nível 1 — Golpe Fortalecido (passiva): você ganha +2 no dano e +1 no acerto'),
  N('Nível 2 — Golpe Adicional (reação) [2S]: ataca novamente com desvantagem'),
  N('Limit break'),
  N('Nível 8 — Ponto Fraco (completa) [4S]: crítico automático +50% dano'),
  N('Vigor'),
  N('Nível 1 — Vitalidade Extra (passiva): +1d4 de vida por nível'),
  H2('Alma'),
  N('Mundo Astral'),
  N('Você pode gastar uma ação completa para entrar no mundo astral, deixando o corpo no local.'),
  N('1 - Por 2 rodadas o alvo se sente tonto, todos os testes com -4.'),
  N('Conexão'),
  N('Nível 1 — Vínculo Astral (passiva): ao errar um ataque, pode rerolar o teste'),
];

// Recorte da seção "# Status" (Vida/Stamina por natureza em bullets; nome "Brutamonte"
// no singular; Sanidade fica fora do escopo).
const SAMPLE_STATUS = [
  H1('Status'),
  N('Vida'),
  N('Brutamonte'),
  N('Nível 0: 10 + 5d4 + 5*Corpo'),
  N('Por nível: 5 + 3*Corpo'),
  N('Guerreiro'),
  N('Nível 0: 10 + 3d8 + 3*Corpo'),
  N('Por nível: 5 + 2*Corpo'),
  N('Stamina'),
  N('*Você naturalmente recupera um pouco da sua stamina no início de cada rodada*'),
  N('Brutamonte'),
  N('Nível 0: 5 + 3d6 + 3*Corpo'),
  N('Por nível: 2 + Corpo'),
  N('Recuperação: 5 > 7 > 10 > 15'),
  N('Sanidade'),
  N('100, podendo variar até entre 90 e 110 de acordo com a sua lore'),
];

// Seção "# Naturezas": buff/debuff (strings) + habilidade única no formato de skill
// (Nome (ação) [custo]: desc) — o usuário padroniza o Doc para esse formato.
const SAMPLE_NATURES = [
  H1('Naturezas'),
  N('Brutamontes'),
  N('Buff: Você ganha 2 pontos de vida extra por nível, que se tornam 5 a partir do nível 10'),
  N('Debuff: Sua CA é naturalmente menor por 2 pontos'),
  // Brutamontes: hab. única SEM rótulo "Habilidade única:" (formato real do Doc)
  N('Avanço Brutal (padrão + movimento) [4S]: Você avança a mesma distância de seu movimento, atacando e empurrando todos na linha (inclui aliados), causando 2d6+(2*Corpo)'),
  N('Guerreiro'),
  N('Buff: Você começa usando armas adjacentes leves e médias, ignorando a restrição de Corpo'),
  N('Debuff: Você tem 1 desvantagem ao usar qualquer arma à distância'),
  // Guerreiro: hab. única COM rótulo inline (compatibilidade)
  N('Habilidade única: Rodada de Golpes (bônus) [5S]: 1x por luta, por 2 rodadas, pode atacar uma vez a mais por ação padrão'),
];

// Recorte da seção "# Sistemas e Esclarecimentos": blocos rotulados por parágrafo
// simples; itens "Nome: desc"; DoT com nota de stack; Combos ignorado; CA só intro.
const SAMPLE_SYSTEMS = [
  H1('Sistemas e Esclarecimentos'),
  N('Distâncias'),
  N('Adjacente: 1 metro'),
  N('Curta: 2 - 9 metros'),
  N('DoT'),
  N('Stacks do mesmo DoT acumulam o dano que você recebe e resetam a duração.'),
  N('Sangramento: Você toma dano no começo de seu turno.'),
  N('Esse efeito pode stackar até 3x'),
  N('Combos'),
  N('Combo solo: isto deve ser ignorado'),
  N('CA'),
  N('10 + Bônus de Corpo e Mente ± Implantes - Armadura'),
  N('Chance'),
  N('Sempre que algo tiver uma chance role 1d100.'),
  H1('Ações'),
  N('Não deve aparecer: fora da seção'),
];

// Recorte da seção "# Ações": descrição "Ofensiva VS. Defensiva" + 3 colunas de ações
// (Ofensivas, Defensivas, Inspiradoras). Intro/Obs antes das colunas são ignorados;
// itens "Nome: desc" (Inspiradoras trazem custo "(1PI)"); "custam 2S"/limite de PI = nota.
const SAMPLE_ACTIONS = [
  H1('Ações'),
  N('Existem as ações: Padrão, Bônus, Movimento, Fala, Reação e Coringa.'),
  N('Obs:'),
  N('Ações de Fala resetam por luta, não por rodada'),
  N('Ofensiva VS. Defensiva'),
  N('Caso o atacante não passe da CA do defensor, ele erra naturalmente, sem necessidade de reação.'),
  N('Em casos de ambas ações ofensivas e defensivas critarem, vence o maior resultado total.'),
  N('Ofensivas'),
  N('Atacar: Consome 1 ação padrão e seu teste é 1d20+Corpo/Mente+Implante.'),
  N('Ataque de oportunidade: Consome 1 reação, pode ser usado quando um inimigo:'),
  N('1- se move em distância adjacente de você;'),
  N('Ações ofensivas básicas custam 2S'),
  N('Defensivas'),
  N('Esquivar: Consome 1 reação e seu teste é 1d20+Mente-Armadura, nega todo o dano.'),
  N('Ações defensivas básicas custam 2S'),
  N('Inspiradoras'),
  N('Você pode conceder aos seus aliados 1 ponto de inspiração fazendo algo que os inspira.'),
  N('Com pontos de inspiração você pode:'),
  N('Superar seus limites (1PI): Transforma uma falha em um acerto, um acerto em um crítico.'),
  N('Dar mais um suspiro (2PI): Quando em 0 de stamina, você não gasta stamina no próximo turno.'),
  N('Você pode ter até um máximo de 3 pontos de inspiração'),
  H1('Naturezas'),
  N('Não deve aparecer: fora da seção'),
];

module.exports = { SAMPLE, SAMPLE_SUBATTR, SAMPLE_STATUS, SAMPLE_NATURES, SAMPLE_SYSTEMS, SAMPLE_ACTIONS };
