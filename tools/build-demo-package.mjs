/** Generate a rights-clear, complete downloadable show ZIP for Windows testing. */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoPackage, DEMO_FILE, DEMO_SCRIPT } from '../src/core/demoShow.mjs';

export { buildDemoPackage, DEMO_FILE, DEMO_SCRIPT };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(DEMO_FILE);
  const { archive, project } = await buildDemoPackage();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, archive);
  console.log('Saved complete, rights-clear local example: ' + output);
  console.log(project.cues.length + ' operator-approved manual example cues and ' +
    project.assets.length + ' original synthetic WAV files. NO Meta AI request or automatic GO.');
}
