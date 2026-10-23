import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { chromium } from 'playwright';

async function isExecutable(path) {
  try { await access(path, constants.X_OK); return true; } catch { return false; }
}

export async function findBrowser(explicitPath) {
  const configured = explicitPath || process.env.CHROMIUM_PATH;
  if (configured) {
    if (!await isExecutable(configured)) throw new Error(`Chromium is not executable at ${configured}. Check --browser or CHROMIUM_PATH.`);
    return configured;
  }
  const candidates = [chromium.executablePath(), '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const path of candidates) if (await isExecutable(path)) return path;
  throw new Error('Chromium was not found. Run "npx playwright install chromium" after "npm ci", or set CHROMIUM_PATH to an installed Chromium executable. All export formats use Chromium for mandatory overflow validation.');
}

export async function openRenderer(options) {
  const executablePath = await findBrowser(options.browser);
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
  } catch (error) {
    throw new Error(`Could not launch Chromium (${executablePath}). Install its OS dependencies, or try "npx playwright install --with-deps chromium" where permitted. ${error.message}`, { cause: error });
  }
  try {
    const context = await browser.newContext({
      viewport: { width: options.width + 64, height: options.height + 64 },
      deviceScaleFactor: options.scale,
      javaScriptEnabled: false,
      serviceWorkers: 'block'
    });
    await context.route('**/*', route => route.abort('blockedbyclient'));
    const page = await context.newPage();
    return { browser, context, page, executablePath };
  } catch (error) { await browser.close(); throw error; }
}

/** Check both scroll dimensions and descendants, so wide code/tables cannot silently clip. */
export async function measureCards(page) {
  return page.locator('.card').evaluateAll(cards => cards.map((card, index) => {
    const content = card.querySelector('.card-content');
    const footer = card.querySelector('.card-footer');
    const bounds = content.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const tolerance = 1;
    const problems = [];
    if (content.scrollHeight > content.clientHeight + tolerance) problems.push('content-height');
    if (content.scrollWidth > content.clientWidth + tolerance) problems.push('content-width');
    if (footer.scrollHeight > footer.clientHeight + tolerance || footer.scrollWidth > footer.clientWidth + tolerance) problems.push('footer');
    if (bounds.bottom > footerBounds.top + tolerance) problems.push('content-footer-overlap');
    if (footerBounds.bottom > cardBounds.bottom + tolerance) problems.push('footer-height');
    for (const element of content.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height && (rect.right > bounds.right + tolerance || rect.left < bounds.left - tolerance)) {
        problems.push(`wide-${element.tagName.toLowerCase()}`);
      }
      if (element.scrollWidth > element.clientWidth + tolerance && ['PRE', 'TABLE', 'CODE'].includes(element.tagName) && element.clientWidth > 0) problems.push(`scroll-${element.tagName.toLowerCase()}`);
    }
    return {
      index: index + 1,
      available: { width: content.clientWidth, height: content.clientHeight },
      used: { width: content.scrollWidth, height: content.scrollHeight },
      overflow: [...new Set(problems)]
    };
  }));
}
