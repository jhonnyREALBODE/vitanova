# Vita Nova — cartão do grupo aberto

Destino do link "grupo aberto" dos stories. Objetivo único: entrar no grupo.

**Não é um site — é um cartão.** Uma tela, sem rolagem, centrado. A pessoa chega
do story, a cena converge, lê em três segundos e clica.

## Como visualizar

Arquivo único, sem build e sem dependências:

```bash
open index.html          # macOS
xdg-open index.html      # Linux

# ou, para replicar produção:
python3 -m http.server 8090
```

Para publicar, suba só o `index.html`. É independente do site principal e não
entra no `dist/` dele.

## Decisões

**Uma tela, não uma página.** Sem seções empilhadas, sem lista de benefícios com
checkmarks, sem CTA repetido — cada um desses é sinal de template. Marca, tese,
reconhecimento, ação.

**A animação é a tese.** Três correntes de partículas — verde, creme e terracota —
convergem de direções diferentes para um mesmo núcleo, que dá um flash quando a
convergência chega. É literalmente "três hábitos, uma raiz" em movimento, e não
repete o diagrama de ramificações do site principal. Passada a abertura, a cena
recua 44% para o texto respirar.

**Canvas 2D, não Three.js.** O site principal usa Three (122 KB gzip); num link
que abre dentro do Instagram em 4G isso não se paga. Toda a cena — sprites
pré-renderizados, rastros por apagamento parcial do quadro, glow por gradiente
radial — cabe em alguns KB. A página inteira tem **5783 bytes gzip (14522 cru)
numa única requisição**.

**Performance medida, não estimada.** 61 fps normal e **46 fps com a CPU 4×
throttled** (aproximação de celular de gama média). Chegar lá exigiu limitar o DPR
do canvas a 1,25 — a cena é glow difuso, não tem detalhe fino que justifique 2×, e
o fill rate era o gargalo. Antes disso eram 23 fps.

**Os três ângulos alternam no mesmo lugar**, a cada 4,2 s, em vez de virarem três
blocos. A troca é sequencial, não cruzada: a frase que sai some antes da próxima
aparecer — no crossfade simultâneo as duas ficam legíveis ao mesmo tempo por 0,7 s
e o texto vira um borrão.

**Acabamento.** Fundo verde-noite, hairlines em vez de bordas, marcas de corte nos
cantos como num impresso, serifada em itálico nas falas, um único acento de cor.

## Trocar a marca

O monograma VN está em dois pontos do `index.html`, ambos marcados por comentário:
o favicon (data URI no `<head>`) e o `.mark` do cartão.

## Verificado

- Cabe em uma tela **sem rolagem** em 360×640, 375×667, 390×844, 412×915, 1280×800 e 1440×900
- CTA visível e link correto em todas; sem scroll horizontal
- 61 fps normal, 46 fps com CPU 4× throttled
- Rodízio percorre as três frases na ordem, sem sobreposição
- `prefers-reduced-motion`: um quadro estático, sem loop, as três frases legíveis
