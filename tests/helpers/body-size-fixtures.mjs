import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '../../scripts/templates.mjs';
import { THEMES, LAYOUTS, SIZES } from '../../scripts/document.mjs';
import { createAssetResolver } from '../../scripts/assets.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export async function defaultBodyFixtures() {
  const fixtures = [];
  const load = async (id, input, options) => {
    const source = await readFile(path.join(ROOT, input), 'utf8');
    const assets = await createAssetResolver(path.join(ROOT, 'examples/templates'));
    fixtures.push({ id, input, source, options, resolveImage: assets.resolveImage });
  };
  for (const template of TEMPLATES) await load(template.id, template.example, SIZES.portrait);
  const aspects = JSON.parse(await readFile(path.join(ROOT, 'docs/aspect-gallery-evidence.json'), 'utf8'));
  for (const item of aspects.records) await load(item.id, item.input, SIZES[item.aspect]);
  for (const theme of THEMES) for (const layout of LAYOUTS) {
    const source = `<!-- card: ${JSON.stringify({ layout })} -->\n# 标题 Title\n\n正文 **Bold** & text.\n\n## Section A\n\n- List\n  - Nested\n\n> Quote\n\n## Section B\n\n| Key | Value |\n|---|---|\n| A | B |\n\n\`\`\`text\na < b\n\`\`\``;
    fixtures.push({ id: `${theme}/${layout}`, source, options: { ...SIZES.portrait, theme } });
  }
  return fixtures;
}
