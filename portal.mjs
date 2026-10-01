import {apps} from './apps.mjs';
const grid = document.querySelector('#app-grid');
const icons = {
  record: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="5" width="24" height="30" rx="3"/><path d="M6 12h6M6 20h6M6 28h6M17 13h10M17 20h10M17 27h7"/></svg>',
  chat: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 8h23v18H16l-9 6V8Z"/><path d="m22 29 4 4 8-9"/><path d="M13 14h11M13 19h8"/></svg>',
};
function textElement(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
const cards = apps.map(app => {
  if (!/^\/[a-z0-9-]+\/$/.test(app.href)) throw new Error('An app must have a local directory path');
  const card = document.createElement('a');
  card.className = 'app-card';
  card.href = app.href;
  card.setAttribute('aria-label', `${app.name}を開く`);
  const icon = textElement('span', '', 'app-icon');
  icon.innerHTML = icons[app.icon] || icons.chat;
  const tags = textElement('span', '', 'card-tags');
  tags.append(...app.tags.map(tag => textElement('span', tag)));
  const footer = textElement('span', 'アプリを開く', 'card-footer');
  const arrow = textElement('span', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  footer.append(arrow);
  card.append(icon, textElement('span', app.category, 'card-category'), textElement('h3', app.name), textElement('p', app.description), tags, footer);
  return card;
});
grid.replaceChildren(...cards);
