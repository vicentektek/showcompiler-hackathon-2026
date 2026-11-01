import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function browserCandidates() {
  const candidates = [];
  if (process.platform === 'win32') {
    for (const executablePath of [
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]) {
      if (existsSync(executablePath)) candidates.push({ executablePath });
    }
  }

  const managedPath = chromium.executablePath();
  if (existsSync(managedPath)) candidates.push({ executablePath: managedPath });
  candidates.push({ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' });

  const seen = new Set();
  return candidates.filter(candidate => {
    const key = candidate.executablePath ?? `channel:${candidate.channel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The Show Builder keeps RUNQ AI collapsed on a fresh AI visit; open it the way an operator would. */
export async function openShowBuilderAssistant(page) {
  const disclosure = page.locator('#rqShowBuilderAiHelp');
  if (await disclosure.count() && await disclosure.getAttribute('open') === null)
    await page.locator('#rqShowBuilderAiHelp > summary').click();
  await page.locator('#rqAgentPrompt').waitFor({ state: 'visible' });
}

export async function launchTestBrowser() {
  const diagnostics = [];
  for (const candidate of browserCandidates()) {
    const label = candidate.executablePath ?? `channel=${candidate.channel}`;
    try {
      const browser = await chromium.launch({
        ...candidate,
        headless: true,
        dumpio: true,
        timeout: 30000,
      });
      return { browser, label };
    } catch (error) {
      diagnostics.push(`${label}: ${error?.stack ?? String(error)}`);
    }
  }

  throw new Error([
    `Unable to launch a Playwright browser (${process.platform}/${process.arch}, Node ${process.version}).`,
    `Playwright-managed executable: ${chromium.executablePath()} (${existsSync(chromium.executablePath()) ? 'exists' : 'missing'}).`,
    'Launch attempts and browser process output:',
    ...diagnostics,
  ].join('\n'));
}
