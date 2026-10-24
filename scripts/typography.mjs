/** Repository-owned local font roles. No user CSS, remote font, or bundled font file. */
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const TYPOGRAPHY_ROLES = Object.freeze(['display', 'body', 'numeric', 'quote', 'source']);
export const LOCAL_FONT_STACKS = freeze({
  sans: { families: ['Inter', 'Helvetica Neue', 'Arial', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'], generic: 'sans-serif' },
  humanist: { families: ['Aptos', 'Segoe UI', 'Optima', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'], generic: 'sans-serif' },
  geometric: { families: ['Futura', 'Avenir Next', 'Century Gothic', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'], generic: 'sans-serif' },
  emphatic: { families: ['Arial Black', 'Franklin Gothic Heavy', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'], generic: 'sans-serif' },
  serif: { families: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun'], generic: 'serif' },
  literary: { families: ['Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', 'Georgia'], generic: 'serif' },
  rounded: { families: ['Avenir Next', 'Trebuchet MS', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'], generic: 'sans-serif' },
  mono: { families: ['SFMono-Regular', 'Cascadia Mono', 'Consolas', 'Liberation Mono', 'Noto Sans Mono CJK SC', 'Noto Sans CJK SC', 'Microsoft YaHei'], generic: 'monospace' }
});

// The width ratios are accessibility floors, not density controls. Rhythm is
// intentionally independent of font availability: fallback never shrinks text.
const profile = (display, body, numeric, quote, source, bodyLineHeight, quoteLineHeight, bodyLetterSpacing, paragraphGapScale) => ({
  roles: { display, body, numeric, quote, source }, bodyWidthRatio: 0.043,
  noteWidthRatio: 0.0335, bodyLineHeight, quoteLineHeight, bodyLetterSpacing, paragraphGapScale
});
export const FAMILY_TYPOGRAPHY = freeze({
  editorial: profile('serif', 'sans', 'sans', 'serif', 'sans', 1.52, 1.64, 0, 1.04),
  swiss: profile('sans', 'sans', 'geometric', 'sans', 'mono', 1.46, 1.55, -0.005, 0.9),
  bauhaus: profile('geometric', 'sans', 'geometric', 'geometric', 'sans', 1.48, 1.56, 0, 0.94),
  brutalist: profile('emphatic', 'sans', 'mono', 'sans', 'mono', 1.44, 1.5, -0.005, 0.86),
  technology: profile('humanist', 'humanist', 'mono', 'humanist', 'mono', 1.48, 1.56, 0, 0.92),
  business: profile('sans', 'humanist', 'sans', 'serif', 'sans', 1.46, 1.56, 0, 0.94),
  journal: profile('serif', 'humanist', 'mono', 'literary', 'mono', 1.58, 1.7, 0.005, 1.08),
  eastern: profile('literary', 'literary', 'serif', 'literary', 'humanist', 1.6, 1.82, 0.015, 1.12),
  newspaper: profile('serif', 'literary', 'mono', 'serif', 'sans', 1.48, 1.6, 0, 0.94),
  film: profile('serif', 'humanist', 'mono', 'serif', 'mono', 1.5, 1.64, 0.005, 1.02),
  pop: profile('rounded', 'sans', 'mono', 'rounded', 'sans', 1.44, 1.5, 0, 0.9),
  nature: profile('literary', 'humanist', 'sans', 'literary', 'serif', 1.56, 1.68, 0.005, 1.06)
});

export function typographyForFamily(family) {
  if (!Object.hasOwn(FAMILY_TYPOGRAPHY, family)) throw new RangeError(`Unknown typography family: ${family}`);
  return freeze({ profile: `local-roles-${family}-v2`, ...FAMILY_TYPOGRAPHY[family] });
}

/** Deterministic static CSS; only this closed registry can produce its values. */
export function templateTypographyCss() {
  const stacks = Object.entries(LOCAL_FONT_STACKS).map(([id, stack]) => `  --local-${id}: ${stack.families.map(name => JSON.stringify(name)).join(', ')}, ${stack.generic};`).join('\n');
  const families = Object.entries(FAMILY_TYPOGRAPHY).map(([id, entry]) => {
    const roles = TYPOGRAPHY_ROLES.map(role => `  --font-${role}: var(--local-${entry.roles[role]});`).join('\n');
    return `.card.template-card.family-${id} {\n${roles}\n  --body-leading: ${entry.bodyLineHeight}; --quote-leading: ${entry.quoteLineHeight};\n  --body-tracking: ${entry.bodyLetterSpacing}em; --paragraph-rhythm: ${entry.paragraphGapScale};\n}`;
  }).join('\n');
  return `/* BEGIN LOCAL ROLE TYPOGRAPHY: generated from scripts/typography.mjs. */\n.card.template-card {\n${stacks}\n  --font-display: var(--local-sans); --font-body: var(--local-sans);\n  --font-numeric: var(--local-mono); --font-quote: var(--local-serif);\n  --font-source: var(--local-sans); --font-code: var(--local-mono);\n  --body-leading: 1.5; --quote-leading: 1.65; --body-tracking: 0em; --paragraph-rhythm: 1;\n  font-family: var(--font-body); letter-spacing: var(--body-tracking);\n}\n${families}\n/* END LOCAL ROLE TYPOGRAPHY */`;
}

/** Inventory inference only, never a claim about a browser's per-glyph choice.
 * Fontconfig may return comma-separated aliases for a family. Names are matched
 * exactly and case-insensitively; a similar name is not proof of installation. */
export function inspectLocalTypography(families, { scanAvailable = true } = {}) {
  const installed = new Map(families.flatMap(name => String(name).split(',')).map(name => [name.trim().toLowerCase(), name.trim()]));
  const stacks = Object.fromEntries(Object.entries(LOCAL_FONT_STACKS).map(([id, stack]) => {
    const availableFamilies = stack.families.filter(name => installed.has(name.toLowerCase())).map(name => installed.get(name.toLowerCase()));
    return [id, { requestedFamilies: [...stack.families], availableFamilies,
      firstInstalledCandidate: availableFamilies[0] ?? null,
      fallback: stack.generic, selection: !scanAvailable ? 'unverified' : availableFamilies.length ? 'local-candidate' : 'generic-fallback',
      browserSelection: 'unverified' }];
  }));
  return { schemaVersion: 1, localOnly: true, browserSelection: 'unverified', stacks,
    families: Object.fromEntries(Object.keys(FAMILY_TYPOGRAPHY).map(family => [family, typographyForFamily(family)])) };
}
