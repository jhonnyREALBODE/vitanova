# Páginas de acesso restrito

## Turma paga — `/acesso/82fd649aed29`

Cartão entregue a quem comprou. Mesmo desenho do `/grupo`, com o link do grupo
exclusivo e textos de pós-compra.

**A proteção é o token no caminho**, não autenticação: quem tiver a URL entra.
`/acesso/` e qualquer outro caminho abaixo dele respondem 404. A página tem
`noindex` no HTML, `X-Robots-Tag` no `_headers` e está no `robots.txt`, então
não aparece em busca — mas se a URL for encaminhada por alguém, funciona para
quem receber.

**A cada turma nova:** renomeie a pasta `public/acesso/<token>/` com um token
novo (`python3 -c "import secrets; print(secrets.token_hex(6))"`) e troque o
link do grupo dentro do arquivo. O link antigo deixa de existir na hora.

Se um dia precisar de proteção real — link individual por comprador, validado
contra a compra — o caminho é o webhook da Cacto chegando numa rota do próprio
Worker.
