/**
 * RUNQ video capture companion (Windows/Chrome). Uses REAL RUNQ UI, not a mock.
 * Offline plan/check by default; no cloud API, audio GO, ARM or OBS command on its own.
 * A microphone WAV can be fed through Chromium's real getUserMedia for ASR tests;
 * RUNQ's own user-facing session consent/ARM actions remain manual.
 */
import {access,mkdir,readFile,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SHOTS=resolve(ROOT,'docs/video/demo-pack/video_shots.json');
const ORIGINAL=resolve(ROOT,'fixtures/demo/runq-the-last-go-en.txt');
const SHOW_ZIP=resolve(ROOT,'production/runq-video-kit/RUNQ_THE_LAST_GO_EN.showcompiler.zip');
const OUTPUT=resolve(ROOT,'production/runq-video-kit/captures');
const req=createRequire(import.meta.url);
const requireVoiceScenes=new Set(['S05','S08']);
const workspaceFor={S03:'home',S04:'script',S05:'cues',S06:'audio',S07:'rehearsal',S08:'rehearsal',S09:'operation'};

function usage(){
  return [
    'RUNQ Video Director — no API inference, no automatic GO, no automatic ARM.',
    'PLAN: node tools/video/run-demo-director.mjs --plan',
    'CHECK: node tools/video/run-demo-director.mjs --check',
    'SHOT: node tools/video/run-demo-director.mjs --scene S05 --capture',
    'ASR:  node tools/video/run-demo-director.mjs --scene S08 --mic-wav "C:\\path\\to\\mic_linear_12s.wav" --voice-opt-in --capture',
    'S05 ASR: ... --scene S05 --mic-wav "C:\\path\\to\\operator_mic_12s.wav" --voice-opt-in --capture',
    'IMPORTANT: --capture creates SILENT Playwright video. Use OBS to capture real app/system audio.',
    'The browser remains operator-driven for consent, ARM, GO, STOP and provider requests.'
  ].join('\n');
}
export function parseArgs(argv){
  const options={plan:false,check:false,scene:null,micWav:null,capture:false,voiceOptIn:false,
    timeoutSeconds:180};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--plan')options.plan=true;
    else if(a==='--check')options.check=true;
    else if(a==='--scene')options.scene=argv[++i];
    else if(a==='--mic-wav')options.micWav=argv[++i];
    else if(a==='--capture')options.capture=true;
    else if(a==='--voice-opt-in')options.voiceOptIn=true;
    else if(a==='--timeout-seconds')options.timeoutSeconds=Number(argv[++i]);
    else if(a==='--help'||a==='-h')options.help=true;
    else throw Error('Unknown option '+a);
  }
  const selections=[options.plan,options.check,options.scene!==null].filter(Boolean).length;
  if(!options.help&&selections!==1)throw Error('Choose exactly one of --plan / --check / --scene');
  if(options.scene!==null&&!Object.hasOwn(workspaceFor,options.scene))throw Error('Unsupported scene: '+options.scene);
  if(options.micWav&&!requireVoiceScenes.has(options.scene))throw Error('Microphone WAV only allowed for S05 / S08');
  if(options.micWav&&!options.voiceOptIn)throw Error('--mic-wav needs explicit --voice-opt-in');
  if(options.voiceOptIn&&!options.micWav)throw Error('--voice-opt-in needs --mic-wav');
  if(!Number.isInteger(options.timeoutSeconds)||options.timeoutSeconds<10||options.timeoutSeconds>600)
    throw Error('--timeout-seconds must be an integer between 10 and 600');
  if((options.plan||options.check)&&(options.capture||options.micWav))throw Error('Plan/check must have zero capture/voice');
  return options;
}
export async function plan(){
  const shotData=JSON.parse(await readFile(SHOTS,'utf8'));
  if(shotData.schema!=='runq-film-shots/v1'||shotData.scenes.length!==11)
    throw Error('Unexpected storyboard manifest');
  const ids=shotData.scenes.map(s=>s.id);
  if(new Set(ids).size!==11||ids.some((s,i)=>s!=='S'+String(i+1).padStart(2,'0')))
    throw Error('Storyboard scenes must be S01–S11');
  return shotData;
}
function available(name){try{req.resolve(name);return true;}catch{return false;}}
async function readable(path){try{await access(path,constants.R_OK);return true;}catch{return false;}}
export async function check(){
  const checked={
    node:process.version,
    chromePlaywright:available('playwright-core'),
    originalTheatreScript:await readable(ORIGINAL),
    cueSourceModule:await readable(resolve(ROOT,'src/core/demoShow.mjs')),
    localShowZip:await readable(SHOW_ZIP),
    playwrightVideoSound:'NOT_CAPTURED (OBS required for application audio)',
    noPaidCalls:true,
  };
  const manifest=await plan();
  checked.storyboardScenes=manifest.scenes.length;
  return checked;
}
function realName(scene){return ({S03:'RUNQ home',S04:'Original script import',S05:'Cue conversational editing',
  S06:'Audio library and waveform',S07:'Rehearsal disarmed',
  S08:'Rehearsal voice ASR and Auto GO',S09:'Manual operation'})[scene];}
async function ask(rl,prompt){
  if(!process.stdin.isTTY)throw Error('INTERACTIVE_OPERATOR_TERMINAL_REQUIRED');
  return (await rl.question('\n'+prompt+'\n> ')).trim();
}
function log(message){console.log('[RUNQ VIDEO] '+message);}
async function startServer(){
  const {createAppServer}=await import('../dev-server.mjs');
  const server=createAppServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
export async function runScene(opts){
  const checks=await check();
  if(!checks.chromePlaywright)throw Error('Install with: npm install --no-save playwright-core; requires Chrome');
  if(!checks.originalTheatreScript)throw Error('Missing original English TXT');
  const needsZip=opts.scene!=='S04'&&opts.scene!=='S03';
  if(needsZip&&!checks.localShowZip)throw Error(
    'Missing English demo ZIP. First run: node tools/video/build-the-last-go.mjs');
  if(opts.micWav){
    const path=resolve(opts.micWav);
    if(extname(path).toLowerCase()!=='.wav')throw Error('Chromium microphone input must be WAV');
    const info=await stat(path);
    if(!info.isFile()||info.size<500)throw Error('Microphone WAV missing/empty');
    opts.micWav=path;
  }
  const rl=createInterface({input,output});
  let browser=null,context=null,page=null,server=null;
  try{
    if(opts.micWav){
      const message=[
        'REAL provider recognition may consume credits or transmit audio.',
        'Chromium will feed this exact WAV to a simulated microphone device.',
        'RUNQ will still require its own consent checkbox, authorization and optional ARM.',
        'Only proceed if the real voice provider is configured and permitted under its spend policy.',
        'Type EXACTLY: I AUTHORIZE VOICE'
      ].join('\n');
      if(await ask(rl,message)!=='I AUTHORIZE VOICE')throw Error('VOICE_NOT_AUTHORIZED');
    }
    const {chromium}=await import('playwright-core');
    ({server,url:undefined}= {});
    const local=await startServer();
    server=local.server;
    const browserArgs=['--no-first-run','--no-default-browser-check'];
    if(opts.micWav)browserArgs.push('--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture='+opts.micWav+'%noloop');
    browser=await chromium.launch({channel:'chrome',headless:false,args:browserArgs,slowMo:180});
    context=await browser.newContext({viewport:{width:1920,height:1080},
      deviceScaleFactor:1,acceptDownloads:true,
      ...(opts.capture?{recordVideo:{dir:OUTPUT,size:{width:1920,height:1080}}}:{}),
    });
    if(opts.micWav){
      // The operator authorized this device before launch. App-level consent remains separate.
      await context.grantPermissions(['microphone'],{origin:local.url});
    }
    page=await context.newPage();
    page.on('dialog',async dialog=>{
      // Neither browser context nor director silently accepts ARM dialogs.
      let answer='';
      try{answer=await ask(rl,
        'RUNQ is asking to ARM/confirm: '+dialog.message()+
        '\nType ARM for explicit approval, otherwise press Enter to decline.');}catch{}
      if(answer==='ARM'&&dialog.type()==='confirm')await dialog.accept();
      else await dialog.dismiss();
    });
    await page.goto(local.url+'/',{waitUntil:'domcontentloaded'});
    await page.locator('[data-workspace-nav="home"]').waitFor({state:'visible'});
    if(opts.scene==='S04'){
      await page.locator('#scriptFileInput').setInputFiles(ORIGINAL);
      await page.waitForTimeout(700);
    }else if(needsZip){
      await page.locator('#bundleFileInput').setInputFiles(SHOW_ZIP);
      await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent?.trim()==='3',
        null,{timeout:12000});
    }
    const tab=page.locator('[data-workspace-nav="'+workspaceFor[opts.scene]+'"]');
    await tab.click();
    if(opts.scene==='S05'){
      const first=page.locator('#cueList .cue-item').first();
      if(await first.count())await first.click();
      const editor=page.locator('.rq-chat-open').first();
      if(await editor.count())await editor.click();
    }
    if(opts.scene==='S08'&&await page.locator('#rqLiveLang').count())
      await page.locator('#rqLiveLang').selectOption('en');
    if(opts.scene==='S08'&&!opts.micWav)
      log('No microphone WAV selected: this is an offline positioning shot ONLY.');
    await mkdir(OUTPUT,{recursive:true});
    if(opts.capture)await page.screenshot({path:resolve(OUTPUT,opts.scene+'-before.png')});
    log('Scene '+opts.scene+' — '+realName(opts.scene));
    log('OPERATE the real UI now. No GO/ARM/Meta call has been made by this tool.');
    if(opts.micWav)log('Audio source is a prerecorded WAV via Chromium fake microphone (NOT a human microphone).');
    log('If using OBS, start/stop OBS capture manually. Playwright browser video is SILENT.');
    await ask(rl,'When the scene is complete, press Enter to stop capturing and save a final screenshot.');
    if(opts.capture)await page.screenshot({path:resolve(OUTPUT,opts.scene+'-after.png')});
    if(opts.scene==='S08'&&await page.locator('#rqLiveArm').getAttribute('aria-pressed')==='true')
      log('WARNING: Auto GO remained armed in UI. Ensure STOP ALL/DISARM before leaving.');
    await page.close();
    if(opts.capture)log('Playwright recorded a SILENT browser video under '+OUTPUT);
    log('End of shot. Save OBS application-audio recording separately.');
  }finally{
    try{await page?.close();}catch{}
    try{await context?.close();}catch{}
    try{await browser?.close();}catch{}
    try{await new Promise(resolve=>server?.close(resolve)??resolve());}catch{}
    rl.close();
  }
}
async function main(){
  let opts;
  try{opts=parseArgs(process.argv.slice(2));}
  catch(error){console.error(error.message+'\n'+usage());process.exitCode=2;return;}
  if(opts.help){console.log(usage());return;}
  if(opts.plan){console.log(JSON.stringify(await plan(),null,2));return;}
  if(opts.check){console.log(JSON.stringify(await check(),null,2));return;}
  try{await runScene(opts);}
  catch(error){console.error('[RUNQ VIDEO ERROR]',error.message);process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
