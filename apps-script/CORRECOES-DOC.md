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

---

Depois disso, **Ponte ARC → Pré-visualizar** deve mostrar **14 classes**, **8 subatributos** e **0 avisos**.
