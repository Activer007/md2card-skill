/* Progressive enhancement only. Static links and native details need no script. */
(() => {
  'use strict';
  const panel = document.querySelector('[data-filter-panel]');
  const result = document.getElementById('filter-result');
  const family = document.getElementById('family-filter');
  const purpose = document.getElementById('purpose-filter');
  const image = document.getElementById('image-filter');
  const density = document.getElementById('density-filter');
  const reset = document.getElementById('reset-filters');
  const acceptedEmpty = document.querySelector('[data-empty="accepted"]');
  const pendingEmpty = document.querySelector('[data-empty="pending"]');
  const cards = Array.from(document.querySelectorAll('[data-template-card]'));
  if (!panel || !result || !family || !purpose || !image || !density || !reset || !acceptedEmpty || !pendingEmpty) return;
  const normalized = value => String(value).normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
  function applyFilters() {
    const query = normalized(purpose.value);
    let accepted = 0;
    let pending = 0;
    for (const card of cards) {
      const matches = (!family.value || card.dataset.family === family.value)
        && (!image.value || card.dataset.image === image.value)
        && (!density.value || card.dataset.density === density.value)
        && (!query || normalized(card.dataset.purpose).includes(query));
      card.hidden = !matches;
      if (matches && card.dataset.status === 'accepted') accepted += 1;
      if (matches && card.dataset.status === 'pending') pending += 1;
    }
    acceptedEmpty.hidden = accepted !== 0;
    pendingEmpty.hidden = pending !== 0;
    result.textContent = `显示 ${accepted} 个已验收示例，${pending} 个待验收候选。`;
  }
  for (const control of [family, image, density]) control.addEventListener('change', applyFilters);
  purpose.addEventListener('input', applyFilters);
  reset.addEventListener('click', () => {
    for (const control of [family, purpose, image, density]) control.value = '';
    applyFilters();
  });
  applyFilters();
  panel.hidden = false;
})();
