import { escapeHtml } from './markdown.mjs';

export const THEMES = ['editorial', 'minimal', 'midnight', 'notebook', 'bold'];
export const SIZES = {
  portrait: { width: 1080, height: 1440 },
  square: { width: 1080, height: 1080 },
  slide: { width: 1600, height: 900 }
};

export function buildDocument(cards, options, themeCss) {
  const { width, height, theme, title, footer } = options;
  // All interpolated user text is escaped. Only the repository's trusted CSS is inlined.
  const body = cards.map(card => `  <article class="card theme-${theme}" aria-label="Card ${card.index} of ${cards.length}">
    <div class="card-content">${card.html}</div>
    <footer class="card-footer"><span class="footer-text">${escapeHtml(footer)}</span><span class="card-index">${card.index} / ${cards.length}</span></footer>
  </article>`).join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(options.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title>
<style>
:root { --card-width: ${width}px; --card-height: ${height}px; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #e5e7eb; }
.deck { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 32px; width: max-content; min-width: 100%; }
.card { flex: none; }
${themeCss}
@page { size: ${width}px ${height}px; margin: 0; }
@media print {
  html, body { width: ${width}px; margin: 0 !important; padding: 0 !important; background: transparent; }
  .deck { display: block; width: ${width}px; min-width: 0; margin: 0; padding: 0; }
  .card { margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-after: page; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card:last-child { break-after: auto; }
}
</style>
</head>
<body><main class="deck">
${body}
</main></body>
</html>\n`;
}
