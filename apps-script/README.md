# Ponte ARC — instalação e uso

Liga o Doc **"Sistema Intitulados"** ao **ARC** (ficha do player). Você edita as **Classes** e as
**Habilidades de subatributo** (Corpo/Mente/Alma) no Doc e publica; o `ARC_System_V2.html` passa a
ler dessas regras (via Firebase), com fallback offline para os dados embutidos.

## 1. Instalar o script no Doc (uma vez)

1. Abra o Doc **"Sistema Intitulados"**.
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo de `Code.gs`, **cole todo o `Ponte.gs`** e salve (💾).
4. Volte ao Doc e **recarregue a página**. Vai surgir o menu **Ponte ARC** no topo.
5. Na 1ª vez que clicar em **Publicar**, o Google pede autorização (acesso ao Documento +
   requisição externa para o Firebase). Em conta pessoal pode aparecer
   *"O Google não verificou este app"* → **Avançado → Acessar (não seguro)**. É normal para
   um script pessoal seu.

## 2. Regras do Firebase (uma vez) — OBRIGATÓRIO

> ⚠️ **Verificado em 2026-06-16:** hoje a leitura anônima do banco retorna **401 Permission
> denied** (tanto em `arc_rules` quanto em `arc_campaigns`). Isso indica regras restritivas —
> provavelmente as regras de "modo de teste" do Firebase, que **expiram após ~30 dias**. Se for
> isso, a **sincronização de fichas (GM↔jogador) também já parou de funcionar**. Ajustar as
> regras abaixo conserta os dois de uma vez. Sem este passo, o loader do ARC não consegue ler.

No [console do Firebase](https://console.firebase.google.com/) → projeto **intitulations** →
**Realtime Database → Regras**, deixe assim (o ARC lê anônimo):

```json
{
  "rules": {
    "arc_rules": { ".read": true, ".write": true },
    "arc_campaigns": { ".read": true, ".write": true }
  }
}
```

> **Risco aceito na V1:** `arc_rules` fica gravável por quem tiver a URL. Mitigação: o ARC
> mantém cache + dados embutidos, então dá pra restaurar. Reforço futuro (fora do escopo):
> `".write": false` em `arc_rules` + token de escrita no Apps Script via `?auth=` guardado em
> `PropertiesService`. Não mexa em `arc_campaigns` (é a sincronização de fichas que já existe).

## 3. Antes da 1ª publicação: padronizar algumas linhas

Veja **`CORRECOES-DOC.md`** — há 7 linhas de classes (Batedor Cinético/Predador) e 1 de
subatributo (Grande Artífice) fora do padrão. Depois, **Pré-visualizar** deve mostrar
**14 classes**, **8 subatributos** e **0 avisos**.

## 4. Uso diário

1. Edite as Classes no Doc (mantendo o padrão `Nome (ação) [custo]: descrição`).
2. Menu **Ponte ARC → Pré-visualizar** — confere a contagem (14) e os avisos.
3. Menu **Ponte ARC → Publicar no Firebase** — confirma e envia.
4. Os ARCs pegam as novas regras na **próxima vez que abrirem**.

> Lembrete: as funções de parsing no `Ponte.gs` são cópia de `tools/rules-parser/parser.js`
> (a versão testada). Se ajustar o parser, atualize os dois.
