// Pure source construction shared by the runner and source-only evidence checks.
// Keep controlled metadata and the complete, unmodified body in the same bytes.
export function buildRefinementTextInput(template, body) {
  const metadata = { template, density: 'standard', source: '原创阅读练习 · 非外部引文，不构成研究结论' };
  return `<!-- card: ${JSON.stringify(metadata)} -->\n${body}`;
}
