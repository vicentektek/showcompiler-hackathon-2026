import assert from 'node:assert/strict';
import {createAppServer} from './dev-server.mjs';
import {launchTestBrowser} from './browserTestRuntime.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {serializeShowProject} from '../src/core/projectPersistence.mjs';

globalThis.fetch=async()=>{throw new Error('OFFLINE_EXTERNAL_REQUEST_BLOCKED');};
const server=createAppServer({getKey:()=>undefined,getAgentKey:()=>undefined,
  getBasetenKey:()=>undefined,getBasetenAgentKey:()=>undefined,sfxConfig:()=>({enabled:false})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  ({browser}=await launchTestBrowser());
  const page=await browser.newPage();
  page.on('dialog',dialog=>void dialog.accept());
  let calls=0;
  const origin='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)throw new Error('EXTERNAL_BROWSER_REQUEST_BLOCKED');
    if(!url.pathname.startsWith('/api/'))return route.continue();
    if(url.pathname==='/api/agent/interpret'){
      calls++;
      const input=route.request().postDataJSON();
      assert.equal(input.provider,'meta');
      assert.ok(input.context.cues.some(c=>c.number===95));
      assert.ok(input.context.lines.some(l=>l.id==='L2800'));
      if(calls===1)assert.ok(input.context.expert.memory.entries.some(e=>e.text==='Keep the bell, reject the gong.'&&e.status==='APPROVED'));
      else assert.equal(input.context.expert.memory.entries.length,0,'Another project cannot inherit the remembered decision');
      assert.notEqual(input.context.selectedCueId,input.context.expert.runtime.preparedCueId);
      return route.fulfill({json:{status:'ANSWER',message:'Original synthetic answer based on L2800. No edits.',operations:[]}});
    }
    return route.fulfill({json:{configured:url.pathname==='/api/agent/status',enabled:false}});
  });
  let project=createNewShow({name:'Synthetic AI integration',scriptText:Array.from({length:3000},
    (_,i)=>i===2799?'(The bell rings.)':`Marker ${i+1}`).join('\n')});
  for(let i=0;i<95;i++)project=insertManualCue(project,{label:'Marker '+(i+1)}).project;
  project={...project,cues:project.cues.map((c,i)=>i===94?{...c,sourceLineIds:['L2800']}:c)};
  const load=async p=>{
    await page.locator('#projectFileInput').setInputFiles({name:'synthetic.json',mimeType:'application/json',
      buffer:Buffer.from(serializeShowProject(p))});
    await page.locator('[data-workspace-nav="ai"]').click();
    await page.locator('#rqShowBuilderAskAssistant').click();
  };
  await page.goto(origin);
  await load(project);
  await page.locator('#rqAgentPrompt').fill('Remember that Keep the bell, reject the gong.');
  await page.locator('#rqAgentAskAI').click();
  await page.waitForFunction(()=>document.querySelector('#rqAgentStatus')?.textContent.match(/finalizada|Completed/));
  assert.equal(calls,0,'Explicit memory recording is local and cannot invoke a provider');
  await page.reload();
  await load(project);
  await page.locator('[data-cue-select="cue-95"]').evaluate(element=>element.click());
  await page.locator('#rqAgentPrompt').fill('Explain cue 95 at L2800 and recall my confirmed decision.');
  await page.locator('#rqAgentAskAI').click();
  await page.waitForFunction(()=>document.querySelector('#rqAgentStatus')?.textContent.match(/finalizada|Completed/));
  assert.equal(calls,1,'Large projects no longer fail solely because they exceed 80 cues');
  const unchanged=await page.evaluate(()=>{let s;document.dispatchEvent(new CustomEvent('runq:agent-read',
    {detail:{respond:value=>{s=value;}}}));return s.project;});
  assert.equal(unchanged.cues.length,95);
  assert.equal(unchanged.assets.length,0);
  assert.equal(unchanged.scriptText,project.scriptText);
  await load({...project,name:'Different synthetic project'});
  await page.locator('[data-cue-select="cue-95"]').evaluate(element=>element.click());
  await page.locator('#rqAgentPrompt').fill('Explain cue 95 at L2800.');
  await page.locator('#rqAgentAskAI').click();
  await page.waitForFunction(()=>document.querySelector('#rqAgentStatus')?.textContent.match(/finalizada|Completed/));
  assert.equal(calls,2);
  console.log('AI-ONLY INTEGRATION PASS: long-script retrieval, explicit project memory/reopen, Meta-only mock, no show mutations.');
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
