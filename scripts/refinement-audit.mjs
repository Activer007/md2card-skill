// Read-only DOM measurements for reviewed portrait fixtures. This module imports
// no browser; call measureRefinement with page.evaluate in an authorized runtime.
export function measureRefinement() {
  const card = document.querySelector('.card');
  const scale = card.getBoundingClientRect().width / card.offsetWidth;
  const id = card.dataset.template;
  const pixels = element => parseFloat(getComputedStyle(element).fontSize) * scale;
  const paragraphs = [...card.querySelectorAll('.template-main p')].filter(p => p.textContent.trim());
  const reading = paragraphs.map(p => {
    const lines = new Map();
    const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      for (let start = 0; start < node.length;) {
        const length = node.data.codePointAt(start) > 0xffff ? 2 : 1;
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && node.data.slice(start, start + length).trim()) {
          const y = Math.round(rect.top * 2) / 2;
          lines.set(y, (lines.get(y) ?? '') + node.data.slice(start, start + length));
        }
        start += length;
      }
    }
    return { text: p.textContent, measureEm: p.getBoundingClientRect().width / pixels(p), lines: [...lines.values()] };
  });
  const images = [...card.querySelectorAll('.card-image,.markdown-image')].map(image => {
    const rect = image.getBoundingClientRect();
    const fitScale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    return { width: image.naturalWidth * fitScale, height: image.naturalHeight * fitScale,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      sourceScale: fitScale, objectFit: getComputedStyle(image).objectFit };
  });
  const title = card.querySelector('h1');
  const errors = [];
  const minMeasure = ({ T06: 9, T32: 15, T34: 15, T39: 10 })[id];
  if (minMeasure && reading.some(p => p.measureEm < minMeasure - .05)) errors.push(`${id}: paragraph measure below ${minMeasure}em`);
  if (['T16','T39'].includes(id) && reading.some(p => p.lines.length > 1 && /^[\p{Script=Han}\p{P}]{1,2}$/u.test(p.lines.at(-1)))) errors.push(`${id}: isolated CJK/punctuation tail`);
  if (id === 'T20' && (!images[0] || images[0].width < 240)) errors.push('T20: interface overview narrower than 240 phone pixels');
  if (id === 'T40' && (!images[0] || images[0].sourceScale * 48 < 11)) errors.push('T40: original 48px numeric keys smaller than 11 phone pixels');
  const titleBodyRatio = title ? parseFloat(getComputedStyle(title).fontSize) / parseFloat(getComputedStyle(card).fontSize) : null;
  if (['T10','T19','T22','T24'].includes(id) && titleBodyRatio < 2.1) errors.push(`${id}: title is not the primary typographic focus`);
  return { id, scale, titleBodyRatio, reading, images, errors };
}
