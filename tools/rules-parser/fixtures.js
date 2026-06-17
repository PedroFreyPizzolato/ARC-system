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

module.exports = { SAMPLE };
