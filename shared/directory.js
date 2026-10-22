// Progressive enhancement: every project link and date is present without JavaScript.
(() => {
  const input = document.querySelector('#project-search');
  if (!input) return;
  const rows = [...document.querySelectorAll('[data-project]')];
  const sections = [...document.querySelectorAll('.project-section')];
  const count = document.querySelector('#project-count');
  const empty = document.querySelector('#directory-empty');
  const clear = document.querySelector('#clear-search');
  function filter() {
    const words = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const row of rows) {
      row.hidden = !words.every(word => row.dataset.search.includes(word));
      if (!row.hidden) visible++;
    }
    for (const section of sections) section.hidden = !section.querySelector('[data-project]:not([hidden])');
    count.textContent = `${visible} ${visible === 1 ? 'project' : 'projects'}`;
    empty.hidden = visible !== 0;
    clear.hidden = words.length === 0;
  }
  input.addEventListener('input', filter);
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  input.addEventListener('keydown', event => { if (event.key === 'Escape') clear.click(); });
  for (const link of document.querySelectorAll('.category-nav a')) link.addEventListener('click', () => {
    input.value = ''; filter();
    document.querySelector('.category-nav [aria-current]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'location');
  });
})();
