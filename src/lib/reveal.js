/** Reveal on scroll — IntersectionObserver com fallback. */
export function initReveal(root = document) {
  const els = Array.from(root.querySelectorAll('.reveal'));
  if (!els.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  els.forEach((el) => io.observe(el));
}

/**
 * Alterna a classe do header enquanto o hero ocupa o topo da viewport,
 * para o menu ficar claro sobre o fundo escuro e voltar ao normal depois.
 */
export function initHeaderState(headerEl, heroEl) {
  if (!headerEl || !heroEl) return;

  /* Publica a altura real do header como custom property: o hero desconta
     esse valor de 100svh para caber exatamente numa dobra. */
  const publishHeight = () =>
    document.documentElement.style.setProperty('--header-h', `${headerEl.offsetHeight}px`);
  publishHeight();
  window.addEventListener('resize', publishHeight, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(publishHeight);

  const apply = (over) => headerEl.classList.toggle('over-hero', over);

  /* Header sem barra só no topo absoluto. Assim que a página rola, o hero
     passa POR BAIXO do header sticky e a headline atravessa os links da
     nav — nenhum scrim resolve isso de forma confiável, porque o texto do
     hero é claro como o da nav. A partir daí o header ganha fundo. */
  let atTop = null;
  const updateAtTop = () => {
    const next = (window.scrollY || window.pageYOffset || 0) < 24;
    if (next === atTop) return;
    atTop = next;
    headerEl.classList.toggle('at-top', next);
  };
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });

  if (!('IntersectionObserver' in window)) { apply(true); return; }

  const io = new IntersectionObserver(
    ([entry]) => apply(entry.isIntersecting),
    // "topo do hero ainda cobre a faixa do header"
    { rootMargin: `-${headerEl.offsetHeight + 8}px 0px -100% 0px`, threshold: 0 }
  );
  io.observe(heroEl);
  apply(true);
}
