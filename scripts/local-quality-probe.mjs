// A real launch, using the existing renderer's security and cleanup policy.
import { openRenderer, closeBrowser } from './browser.mjs';
let renderer;
try {
  renderer = await openRenderer({ browser: process.argv[2], width: 1080, height: 1440, scale: 1, timeoutMs: 30000 });
  console.log(JSON.stringify({ version: renderer.browser.version(), executablePath: renderer.executablePath, launch: 'verified' }));
} finally {
  if (renderer) await closeBrowser(renderer.browser);
}
