# Correções no Doc antes da 1ª publicação

Duas classes usam um formato diferente das outras 12: **travessão `–` com a ação/custo entre
parênteses e SEM os dois-pontos**. O parser (estrito, por sua escolha) não reconhece esse
formato e gera ⚠️. Basta ajustar **7 linhas** para o padrão das demais:

> Padrão correto: **`Nome (ação) [custo]:` descrição**
> (passivas não têm `[custo]`; o `:` é obrigatório antes da descrição)

Mantenha o **nome em negrito** como já está. A ação que sugeri para as skills que só tinham
custo é **`especial`** — troque se você souber a ação certa (ex.: `padrão`, `bônus`...).

## Batedor Cinético

| Antes (no Doc) | Depois |
|---|---|
| **Aceleração Tática** – (5S) Seu próximo turno... | **Aceleração Tática (especial) [5S]:** Seu próximo turno... |
| **Ressonância Cinética** – (passiva) Para cada esquiva... | **Ressonância Cinética (passiva):** Para cada esquiva... |

## Predador

| Antes (no Doc) | Depois |
|---|---|
| **Dança das Lâminas** – (passiva) Sempre que atingir... | **Dança das Lâminas (passiva):** Sempre que atingir... |
| **Afiado e Breve** – (3S) Causa dano adicional... | **Afiado e Breve (especial) [3S]:** Causa dano adicional... |
| **Olhar do Caçador** – (passiva) Você possui vantagem... | **Olhar do Caçador (passiva):** Você possui vantagem... |
| **Desvanecer** – (4S) Após causar dano... | **Desvanecer (especial) [4S]:** Após causar dano... |
| **Pulso Preciso** – (2S) O próximo ataque... | **Pulso Preciso (especial) [2S]:** O próximo ataque... |

## Em resumo, a mudança é sempre

1. Trocar ` – ` (espaço-travessão-espaço) por um espaço simples.
2. Se o parêntese tinha um **custo** (ex.: `(5S)`), vire `(especial) [5S]` — ou a ação real.
3. Se tinha uma **ação** (ex.: `(passiva)`), mantenha `(passiva)`.
4. Colocar **`:`** logo após o `)` (ou após o `]`), antes da descrição.

## Subatributos (V2) — 1 linha

Uma skill de subatributo não tem `(ação)` entre parênteses (só o `[colchete]`):

| Antes (no Doc, em **Mente → Habilidade → Limit break**) | Depois |
|---|---|
| **Grande Artífice [1x por arco]:** Você pode escolher 1 arma... | **Grande Artífice (especial) [1x por arco]:** Você pode escolher 1 arma... |

(troque `especial` pela ação real, se houver.)

## Naturezas (V4) — 4 linhas (habilidade única)

A **habilidade única** de cada natureza hoje é só `(custo) descrição`, sem nome nem ação.
Para sincronizar tudo (nome + ação + custo + descrição), escreva-a no mesmo formato de skill.
**Buff** e **Debuff** já estão no formato certo — não precisa mexer.

| Natureza | Antes (no Doc) | Depois |
|---|---|---|
| Brutamontes | (4S) Você avança para frente... | **Avanço Brutal (especial) [4S]:** Você avança para frente... |
| Guerreiro | (5S) 1x por luta, por 2 rodadas... | **Rajada de Golpes (especial) [5S]:** 1x por luta, por 2 rodadas... |
| Atleta | (999S) 1x por cena você pode ficar... | **Limite Zero (especial) [999S]:** 1x por cena você pode ficar... |
| Velocista | (15S) Você avança em direção... | **Investida Veloz (especial) [15S]:** Você avança em direção... |

Os **nomes** acima são os que já existem embutidos no ARC (exceto Velocista, que não tinha — escolhi
"Investida Veloz"; troque pelo que preferir). A **ação** sugerida é `especial`; ajuste se souber a real.
Pode manter a habilidade única como **bullet** (`- Nome (ação)...`) ou inline após `Habilidade única:` — tanto faz.

---

Depois disso, **Ponte ARC → Pré-visualizar** deve mostrar **14 classes**, **8 subatributos**,
**4 naturezas** (Vida/Stamina + Buff/Debuff/Hab. Única) e **0 avisos**.
