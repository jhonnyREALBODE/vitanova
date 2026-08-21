# Vita Nova — site institucional

Landing de conversão de uma página, com hero 3D em Three.js.
A tese da marca — **compulsão alimentar, uso excessivo de tela e insônia têm a
mesma raiz: a dopamina desregulada** — é literalmente a estrutura da cena:
uma origem, três ramificações nomeadas.

---

## Como rodar

Requer **Node 22+** — exigência do `wrangler`, usado no deploy. O `.nvmrc`
fixa a versão, e o `.npmrc` tem `engine-strict=true`, então o `npm install`
falha na hora se a versão de Node estiver errada, em vez de deixar o problema
aparecer só no deploy.

```bash
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:5173
npm run build      # build de produção em dist/
npm run preview    # serve o build em http://localhost:4173
```

O `dist/` gerado é estático puro — sobe em qualquer host. Não há backend.

> **Importante:** o repositório não é o site. A raiz contém código-fonte
> (`index.html` aponta para `/src/main.js`, que só o Vite entende). O que vai
> para a hospedagem é sempre o conteúdo de `dist/`, depois do build.

### Deploy no Cloudflare Workers

O projeto é publicado como **site estático no Cloudflare Workers** (não
Pages): o build gera `dist/`, e o `wrangler` sobe esse diretório como assets
estáticos. A configuração vive em `wrangler.jsonc` na raiz.

Painel da Cloudflare → **Settings → Build**:

| Campo | Valor |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(vazio)* |

Para publicar da sua máquina (precisa de `wrangler login` uma vez):

```bash
npm run deploy      # roda o build e sobe
```

**Por que a configuração é explícita.** Sem `wrangler.jsonc`, o
`wrangler deploy` tenta detectar o framework e autoconfigurar o projeto —
e essa autoconfiguração exige Vite 6+, falhando com:

```
✘ [ERROR] The version of Vite used in the project ("5.4.21") cannot be
automatically configured. Please update the Vite version to at least "6.0.0"
```

Com o arquivo presente não há nada a detectar: o wrangler apenas publica
`dist/`. O `name` em `wrangler.jsonc` precisa bater com o nome do Worker no
painel (hoje `vitanova1`) — se renomear o Worker, atualize lá também.

O `wrangler` está fixado como devDependency para o deploy usar sempre a mesma
versão, em vez de baixar a mais recente a cada build.

**Node 22 é obrigatório por causa dele.** O `wrangler` 4.125 exige Node
`>=22.0.0`; com o `.nvmrc` em 20, o `npm ci` apenas avisava (`EBADENGINE`) e o
deploy morria no último passo com *"Wrangler requires at least Node.js
v22.0.0"*. O `engine-strict=true` no `.npmrc` fecha esse buraco: agora a
incompatibilidade derruba o install, não o deploy.

O `public/_headers` define o cache: assets com hash no nome são imutáveis, o
HTML é sempre revalidado (deploy novo aparece na hora). Os assets estáticos do
Workers respeitam esse arquivo — verificado com `wrangler dev`.

---

## Arquitetura

```
index.html                  markup do site (conteúdo validado, intocado)
src/
  main.js                   bootstrap: UI primeiro, 3D depois via import()
  styles/
    base.css                tokens, reset, botões, reveal
    nav.css                 header e seu estado sobre o hero escuro
    hero.css                camada de conteúdo do hero + rótulos do diagrama
    sections.css            demais seções
  lib/
    tween.js                easings, damp, Timeline (substitui GSAP)
    quality.js              detecção de tier + PerfMonitor
    reveal.js               reveal on scroll + estado do header
  three/
    experience.js           orquestrador: renderer, layout, intro, scroll, degradação
    backdrop.js             fundo em clip-space, com crossfade entre regiões
    core.js                 o núcleo (a origem)
    branches.js             as três ramificações
    field.js                campos de partículas
    labels.js               projeção dos rótulos HTML
    postfx.js               bloom (carregado sob demanda)
    palette.js  textures.js  shaders/noise.js
```

### Um canvas para a página inteira

Existe **um único contexto WebGL**, num `<canvas>` `position: fixed` atrás de
todo o conteúdo (`z-index: 0`). As seções claras são opacas e ocluem o canvas
naturalmente; só o hero e a seção escura "Como funciona" ficam translúcidos.

Consequências práticas:

- **Nada de segundo contexto** para a camada ambiente da seção escura — metade
  da memória de GPU e um único conjunto de shaders compilados.
- **Quando nenhuma das duas regiões está na tela, o loop não renderiza nada.**
  Durante a leitura das seções claras, o custo de GPU é zero.
- A classe `.gl` só entra no `<html>` depois que o renderer inicializa. Se o
  WebGL falhar (bloqueado, GPU na blocklist, extensão de privacidade), os
  fundos CSS originais continuam valendo e o site fica intacto.

### Composição responsiva derivada do layout real

O JS **não tem posições fixas em pixel**. Ele lê a caixa real da coluna de
texto (`.hero-inner`) e encaixa a estrutura 3D no espaço que sobra:

- **≥ 1080px** e **paisagem de celular**: texto à esquerda, estrutura à direita.
- **< 1080px em retrato**: estrutura na faixa superior, texto abaixo.

A caixa envolvente usada no cálculo inclui o que é *desenhado* (raio da gaiola
do núcleo, halo dos nós), não só os pontos — é isso que impede a estrutura de
sangrar nas bordas ou passar por baixo do header em telas pequenas.

Os rótulos (`dopamina`, `compulsão`, `tela`, `insônia`) são HTML projetado a
partir das posições 3D: fonte nítida em qualquer DPR, e uma **área segura** que
os impede de invadir a coluna de texto ou sair da tela.

---

## Performance

O critério foi: **preferir cair de qualidade a cair de framerate.**

**1. Orçamento estático** (`detectTier`, antes de alocar geometria) — pontua
GPU (via `WEBGL_debug_renderer_info`), `deviceMemory`, `hardwareConcurrency`,
WebGL2, `MAX_TEXTURE_SIZE` e `save-data`.

| | high | medium | low |
| --- | --- | --- | --- |
| DPR máximo | 2 | 1,6 | 1,25 |
| Bloom | sim (targets a ½ da resolução) | não | não |
| Partículas do campo | 2400 | 1200 | 480 |
| Partículas em fluxo | 168 | 96 | 0 |
| Detalhe do núcleo | 4 | 3 | 2 |
| Camada ambiente | sim | sim | não |

**2. Medição real** (`PerfMonitor`) — mede o framerate depois do warm-up e,
se não sustentar ~50fps, degrada em degraus: bloom → resolução → densidade de
partículas → camada ambiente.

Outras decisões que importam mais que a contagem de partículas:

- Os campos de poeira são animados **inteiramente no vertex shader** a partir de
  sementes por partícula. Os buffers são estáticos; o JavaScript não toca neles.
- As três ramificações são **um único draw call** de `Points` para o fluxo, com
  as curvas pré-amostradas em polilinhas (nada de `getPointAt` por frame).
- Tudo que é aditivo tem raio contido, para limitar overdraw — o gargalo real
  em GPU móvel é fill rate, não vértices.
- Geometria só é reconstruída na troca de breakpoint, nunca por frame.
- `precision` fica no default do Three (highp nos dois estágios). Declarar
  `mediump` só no fragment quebra o link do programa quando um uniform é
  compartilhado com o vertex shader — falha real em drivers móveis.

---

## Acessibilidade

- **`prefers-reduced-motion`**: nenhuma animação contínua. O loop não roda; a
  cena é renderizada em **um único quadro estático**, já no estado final, e
  redesenhada apenas em resize. As animações CSS também são neutralizadas.
- O canvas é `aria-hidden` e `pointer-events: none` — nunca intercepta clique.
- Os CTAs vivem acima do canvas na ordem de empilhamento, sempre com scrim
  garantindo contraste, e continuam clicáveis em toda largura testada.
- Skip link, `:focus-visible` visível e navegação por teclado preservados.
- A aba em segundo plano pausa o loop (`visibilitychange`).

## Validação

Testado em Chromium (headless, WebGL por software — pior caso) em
1440×900, 1280×800, 1080×820, 900×700, 768×1024, 390×844, 360×640 e 844×390,
verificando em cada uma: nenhum rótulo sobrepondo a coluna de texto, nenhum
rótulo fora da tela, ausência de scroll horizontal, e o CTA principal visível
e clicável acima da dobra. Também validados os três tiers e o modo
`prefers-reduced-motion`.

## Pendências de conteúdo

Os links de contato ainda são os placeholders do arquivo original
(`https://wa.me/5500000000000`). Trocar pelo número real antes de publicar.
