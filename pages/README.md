# Páginas não publicadas

Esta pasta fica **fora de `public/`** de propósito: nada aqui entra no `dist/`
nem vai para o ar no deploy.

## `exclusivo/index.html`

Cartão da turma paga — mesmo desenho do `/grupo`, com o link do grupo exclusivo
e textos de pós-compra ("Vaga confirmada", "Entrar no grupo da turma").

Não está publicado porque a URL de um grupo pago não deve ser adivinhável. Quando
for definido como entregá-lo (redirecionamento da Cacto, e-mail de confirmação ou
webhook), ele ganha um endereço — de preferência com caminho não óbvio ou token.

O link do grupo está hardcoded no HTML, marcado por comentário logo antes de
`<main class="card">`. Trocar ali a cada turma.
