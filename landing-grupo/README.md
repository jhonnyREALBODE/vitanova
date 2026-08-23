# Vita Nova — landing do grupo aberto

Página de destino do link "grupo aberto" usado nos stories do Instagram.
Objetivo único: entrar no grupo do WhatsApp.

## Como visualizar

É um arquivo único, sem build e sem dependências. Basta abrir:

```bash
open index.html          # macOS
xdg-open index.html      # Linux
```

Ou servir localmente (recomendado, para o comportamento ser idêntico ao de produção):

```bash
python3 -m http.server 8090
# http://localhost:8090
```

Para publicar, suba só o `index.html` — não há passo de build.
Ele é independente do site principal e não entra no `dist/` dele.

## Decisões

**Sem biblioteca de animação.** GSAP custaria ~23 KB gzip e Framer Motion exigiria
React. Tudo aqui é feito com transições CSS, `IntersectionObserver` e `offset-path`,
que rodam no compositor. A página inteira tem **7,7 KB gzip numa única requisição** —
o que importa quando o tráfego vem do navegador embutido do Instagram, em rede móvel.

**O elemento visual não repete o diagrama do site principal.** Em vez das três
ramificações, aqui a tese aparece como a *curva do sistema de recompensa*: picos
violentos em terracota, cada um cobrando um vale mais fundo, que vão se
estabilizando numa linha de base verde. O gradiente do traço conta a história
sozinho. O caminho é gerado matematicamente (ver o script no histórico do commit) e
fica estático no SVG, então funciona sem JavaScript.

**O CTA nunca some.** Ele aparece acima da dobra em todas as telas testadas
(inclusive 360×640) e, assim que sai de vista, uma barra fixa entra por baixo.

## Trocar a marca

O monograma VN está em dois lugares no `index.html`, ambos marcados por comentário:
o favicon (data URI no `<head>`) e o `.watermark` do bloco escuro. Quando o arquivo
de logo definitivo chegar, é só substituir esses dois.

## Verificado

- CTA acima da dobra e link correto em 360×640, 375×667, 390×844, 768×1024 e 1280×800
- Barra fixa entra ao rolar; sem scroll horizontal em nenhuma largura
- `prefers-reduced-motion`: sem animação contínua, curva já desenhada, nada oculto
- Os 3 links apontam para o grupo correto
