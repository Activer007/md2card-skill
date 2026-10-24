import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { chromium } from 'playwright';
import { Md2CardError } from './errors.mjs';

async function isExecutable(path) {
  try { await access(path, constants.X_OK); return true; } catch { return false; }
}

export async function findBrowser(explicitPath) {
  const configured = explicitPath || process.env.CHROMIUM_PATH;
  if (configured) {
    if (!await isExecutable(configured)) throw new Md2CardError('BROWSER_NOT_FOUND', `Chromium is not executable at ${configured}. Check --browser or CHROMIUM_PATH.`);
    return configured;
  }
  const candidates = [chromium.executablePath(), '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const path of candidates) if (await isExecutable(path)) return path;
  throw new Md2CardError('BROWSER_NOT_FOUND', 'Chromium was not found. Run "npx playwright install chromium" after "npm ci", or set CHROMIUM_PATH to an installed Chromium executable. All export formats use Chromium for mandatory overflow validation.');
}

export const BROWSER_CLEANUP_TIMEOUT_MS = 5000;

/** Bound the close attempt; a timeout is not evidence that Chromium exited. */
export async function closeBrowser(browser, timeoutMs = BROWSER_CLEANUP_TIMEOUT_MS) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => browser.close()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Md2CardError('BROWSER_CLEANUP_TIMEOUT',
          'Browser cleanup timed out; Chromium shutdown could not be confirmed.', { timeoutMs })), timeoutMs);
      })
    ]);
  } catch (error) {
    if (error instanceof Md2CardError && error.code === 'BROWSER_CLEANUP_TIMEOUT') throw error;
    throw new Md2CardError('BROWSER_CLEANUP_FAILED', 'Could not close the render browser.', { reason: error?.message ?? String(error) }, 1, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export async function openRenderer(options, dependencies = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (timedOut || ms <= 0) throw new Md2CardError('RENDER_TIMEOUT', 'Browser initialization exceeded the render deadline.');
    return ms;
  };
  const executablePath = await (dependencies.findBrowser ?? findBrowser)(options.browser);
  const launchTimeout = remaining();
  let browser;
  try {
    browser = await (dependencies.launch ?? (configuration => chromium.launch(configuration)))({ executablePath, headless: true, timeout: launchTimeout });
  } catch (error) {
    throw new Md2CardError('BROWSER_LAUNCH_FAILED', `Could not launch Chromium (${executablePath}). Check OS dependencies and sandbox permissions. Do not disable security restrictions to bypass a denied launch. ${error.message}`, {}, 1, { cause: error });
  }
  let timer;
  try {
    // Chromium's launch timeout does not cover context/route/page initialization.
    // Own the browser and arm the deadline before starting those operations.
    const initializationTimeout = remaining();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Md2CardError('RENDER_TIMEOUT', 'Browser initialization exceeded the render deadline.'));
      }, initializationTimeout);
    });
    const initialize = async () => {
      const context = await browser.newContext({
        viewport: { width: options.width + 64, height: options.height + 64 },
        deviceScaleFactor: options.scale,
        javaScriptEnabled: false,
        serviceWorkers: 'block'
      });
      remaining();
      await context.route('**/*', route => route.abort('blockedbyclient'));
      remaining();
      const page = await context.newPage();
      remaining();
      return { browser, context, page, executablePath };
    };
    return await Promise.race([initialize(), timeout]);
  } catch (error) {
    try { await closeBrowser(browser, Math.min(timeoutMs, BROWSER_CLEANUP_TIMEOUT_MS)); } catch (cleanupError) {
      if (Object.isExtensible(error)) {
        try { error.details = { ...error.details, cleanupFailures: [{ action: 'close-browser', code: cleanupError.code, message: cleanupError.message }] }; } catch { /* Preserve the original initialization failure. */ }
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    let occupiedHeight = 0;
    if (content.scrollHeight > content.clientHeight + tolerance) problems.push('content-height');
    if (content.scrollWidth > content.clientWidth + tolerance) problems.push('content-width');
    if (footer.scrollHeight > footer.clientHeight + tolerance || footer.scrollWidth > footer.clientWidth + tolerance) problems.push('footer');
    if (bounds.bottom > footerBounds.top + tolerance) problems.push('content-footer-overlap');
    if (footerBounds.bottom > cardBounds.bottom + tolerance) problems.push('footer-height');
    for (const element of content.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      // Content is a stretched flex item: scrollHeight cannot reveal a sparse
      // page. Descendant boxes include actual body height, gaps and table heads.
      if (rect.width && rect.height) occupiedHeight = Math.max(occupiedHeight, rect.bottom - bounds.top);
      if (rect.width && rect.height && (rect.bottom > bounds.bottom + tolerance || rect.top < bounds.top - tolerance)) problems.push(`tall-${element.tagName.toLowerCase()}`);
      if (rect.width && rect.height && (rect.right > bounds.right + tolerance || rect.left < bounds.left - tolerance)) {
        problems.push(`wide-${element.tagName.toLowerCase()}`);
      }
      if (element.scrollWidth > element.clientWidth + tolerance && ['PRE', 'TABLE', 'CODE'].includes(element.tagName) && element.clientWidth > 0) problems.push(`scroll-${element.tagName.toLowerCase()}`);
    }
    return {
      index: index + 1,
      available: { width: content.clientWidth, height: content.clientHeight },
      used: { width: content.scrollWidth, height: content.scrollHeight },
      occupied: { height: occupiedHeight },
      overflow: [...new Set(problems)]
    };
  }));
}
