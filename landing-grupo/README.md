# Vita Nova — cartão do grupo aberto

Destino do link "grupo aberto" dos stories. Objetivo único: entrar no grupo.

**Não é um site — é um cartão.** Uma tela, sem rolagem, centrado. A pessoa chega
do story, lê em três segundos e clica.

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
checkmarks, sem CTA repetido — cada um desses é um sinal de template. O que sobrou
é o essencial: marca, tese, prova de reconhecimento, ação.

**Os três ângulos alternam no mesmo lugar.** Em vez de virarem três blocos que
alongam a página, as frases de reconhecimento (geladeira, feed, insônia) se revezam
a cada 4,2 s no mesmo ponto do cartão. Entrega os três ângulos sem custar altura.
Com `prefers-reduced-motion` elas aparecem empilhadas e estáticas — e ainda cabe
em uma tela.

**Sem biblioteca de animação.** GSAP custaria ~23 KB gzip; Framer Motion exigiria
React. Transições CSS e um `setInterval` dão conta. A página inteira tem
**4418 bytes gzip (10459 cru) numa única requisição** — o que importa quando o
tráfego vem do navegador embutido do Instagram, em rede móvel.

**A tese aparece como assinatura, não como diagrama.** Nada do diagrama de
ramificações do site principal: aqui é a curva do sistema de recompensa reduzida a
um traço fino — picos violentos em terracota que se acalmam numa linha de base
verde. O gradiente conta a história; o path é gerado matematicamente e fica
estático no SVG, então desenha sem JavaScript.

**Acabamento.** Fundo verde-noite com respiro radial, hairlines em vez de bordas,
duas marcas de corte nos cantos (como impresso), serifada em itálico para as falas,
caixa alta espaçada para os rótulos. Um único acento de cor, no botão.

## Trocar a marca

O monograma VN está em dois pontos do `index.html`, ambos marcados por comentário:
o favicon (data URI no `<head>`) e o `.mark` do cartão.

## Verificado

- Cabe em uma tela **sem rolagem** em 360×640, 375×667, 390×844, 412×915 e 1280×800
- CTA visível e link correto em todas; sem scroll horizontal
- Rodízio percorre as três frases na ordem
- `prefers-reduced-motion`: sem animação, curva já desenhada, as três frases legíveis
