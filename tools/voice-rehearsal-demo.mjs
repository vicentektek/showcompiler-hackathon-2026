import { readFile } from 'node:fs/promises';
import { replayVoiceRehearsal } from '../src/core/voiceRehearsal.mjs';
const path=process.argv[2]??'test/fixtures/voice-rehearsal.json';
const fixture=JSON.parse(await readFile(path,'utf8'));
const result=replayVoiceRehearsal(fixture);
process.stdout.write(JSON.stringify({fixture:path,...result},null,2)+'\n');
