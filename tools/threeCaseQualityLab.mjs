/**
 * Three-case evaluation review, always offline. Existing provider CLIs own live
 * calls and billing acknowledgment. This tool does not read secrets or fetch.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSeminarCorpus} from './seminarCorpus.mjs';
import {compareProviderReports,renderProviderComparisonReport} from './basetenSeminarEval.mjs';

export const QUALITY_CASE_IDS=Object.freeze(['hotel-door','gala-rundown','delta-signal']);
const ROOT='artifacts/three-case-quality';
const eventKey=e=>[e.sourceLineId??e.lineId,e.transport,e.cueKind,e.basis].join('|');
const validEvent=e=>e&&typeof e==='object'&&/^L[1-9]\d*$/.test(e.sourceLineId)&&
  ['PLAY','STOP','CONTINUE','SILENCE'].includes(e.transport)&&
  ['FX','AMBIENCE','MUSIC','VOICE','TRANSITION','SILENCE'].includes(e.cueKind)&&
  ['EXPLICIT','SUGGESTED'].includes(e.basis);
function assertCaseReport(report,id,provider){
  const model=provider==='META'?'muse-spark-1.3':'meta-models/muse-spark-open-1026';
  if(report?.model!==model||report.realInferenceExecuted!==true||
    !Array.isArray(report.cases)||report.cases.length!==1||
    report.cases[0].id!==id||report.cases[0].status!=='COMPLETE'||
    !Array.isArray(report.cases[0].typedEvents)||
    !Array.isArray(report.cases[0].requests)||
    !report.cases[0].requests.some(r=>r.status==='COMPLETED')||
    report.cases[0].typedEvents.some(e=>!validEvent(e))){
    throw new TypeError('Incomplete, offline, mismatched or invalid '+provider+' report for '+id);
  }
  return report.cases[0];
}
export function buildQualityEvidence(corpus,metaReports,basetenReports){
  if(!Array.isArray(corpus?.cases)||metaReports?.length!==3||basetenReports?.length!==3)
    throw new TypeError('Three original cases and six live reports required');
  const selected=QUALITY_CASE_IDS.map(id=>{
    const c=corpus.cases.find(item=>item.id===id);
    if(!c||!Array.isArray(c.expected)||!Array.isArray(c.forbiddenPlayLineIds))
      throw new TypeError('Missing original case '+id);
    return c;
  });
  const metaCases=selected.map((c,i)=>assertCaseReport(metaReports[i],c.id,'META'));
  const basetenCases=selected.map((c,i)=>assertCaseReport(basetenReports[i],c.id,'BASETEN'));
  const combinedMeta={model:'muse-spark-1.3',realInferenceExecuted:true,cases:metaCases};
  const combinedBaseten={model:'meta-models/muse-spark-open-1026',realInferenceExecuted:true,cases:basetenCases};
  const paired=compareProviderReports(combinedMeta,combinedBaseten,{
    version:1,provenance:corpus.provenance,cases:selected,
  });
  if(paired.casesCompared!==3)throw new TypeError('Missing paired complete cases');
  const reviews=selected.map((c,i)=>{
    const expected=c.expected.map(e=>({sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis}));
    const expectedKeys=new Set(expected.map(eventKey));
    const forbidden=new Set(c.forbiddenPlayLineIds);
    const assess=events=>{
      const predicted=events.map(e=>({sourceLineId:e.sourceLineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis}));
      const keys=new Set(predicted.map(eventKey));
      return {
        predicted,
        missed:expected.filter(e=>!keys.has(eventKey(e))),
        extra:predicted.filter(e=>!expectedKeys.has(eventKey(e))),
        forbiddenPlay:predicted.filter(e=>e.transport==='PLAY'&&forbidden.has(e.sourceLineId)),
        duplicates:predicted.filter((e,j)=>predicted.findIndex(x=>eventKey(x)===eventKey(e))<j),
      };
    };
    return {id:c.id,title:c.title,provisionalGold:true,expected,forbiddenPlayLineIds:[...forbidden],
      meta:assess(metaCases[i].typedEvents),baseten:assess(basetenCases[i].typedEvents)};
  });
  return {kind:'RUNQ_THREE_CASE_INDEPENDENT_REVIEW',realInferenceExecuted:true,
    humanReviewed:false,caseIds:[...QUALITY_CASE_IDS],paired,reviews,
    note:'Only original synthetic cases and typed classifications, no source script, prompts, raw model replies or keys. Gold remains provisional. Artistic suitability requires independent human review.'};
}
export function renderQualityEvidence(result){
  if(result?.kind!=='RUNQ_THREE_CASE_INDEPENDENT_REVIEW')throw new TypeError('Invalid quality evidence');
  return ['# RunQ three-case quality review (not human-certified)','',
    'Complete matched live cases: **3**. Gold is provisional; qualitative decisions require review.','',
    renderProviderComparisonReport(result.paired),
    ...result.reviews.flatMap(c=>[
      '## '+c.id,'',
      'Expected events: '+c.expected.length+'; forbidden PLAY lines: '+c.forbiddenPlayLineIds.join(', ')+'.','',
      ...['meta','baseten'].flatMap(p=>[
        '### '+p,
        '- Predictions: '+c[p].predicted.length,
        '- Missing: '+c[p].missed.map(eventKey).join('; '),
        '- Extra: '+c[p].extra.map(eventKey).join('; '),
        '- Forbidden PLAY: '+c[p].forbiddenPlay.map(eventKey).join('; '),
        '- Duplicates: '+c[p].duplicates.map(eventKey).join('; '),'',
      ]),
    ]),
    'No private scripts, API keys or raw replies are exported. This is diagnostic evidence, not an artistic-quality score.',''].join('\n');
}
export async function runQualityReview({root=ROOT,corpusReader=readSeminarCorpus,reader=readFile,writer=writeFile,createDir=mkdir}={}){
  const corpus=await corpusReader();
  const load=async(provider,id)=>{
    const path=join(root,provider+'-'+id,'report.json');
    return JSON.parse(await reader(path,'utf8'));
  };
  const meta=[],baseten=[];
  for(const id of QUALITY_CASE_IDS){
    meta.push(await load('meta',id));
    baseten.push(await load('baseten',id));
  }
  const report=buildQualityEvidence(corpus,meta,baseten);
  await createDir(root,{recursive:true});
  await writer(join(root,'review.json'),JSON.stringify(report,null,2)+'\n','utf8');
  await writer(join(root,'review.md'),renderQualityEvidence(report),'utf8');
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==2&&!(process.argv.length===3&&process.argv[2]==='--review'))
      throw new TypeError('Only --review supported');
    if(process.argv[2]==='--review'){
      const r=await runQualityReview();
      console.log('Three complete real paired cases reviewed: '+r.paired.casesCompared);
      console.log('Private artifacts: '+ROOT+'/review.{json,md}');
    }else{
      const corpus=await readSeminarCorpus();
      for(const id of QUALITY_CASE_IDS){
        const c=corpus.cases.find(item=>item.id===id);
        if(!c)throw new TypeError('Missing fixture');
        console.log(id+': '+c.expected.length+' expected events, '+c.forbiddenPlayLineIds.length+' forbidden PLAY lines');
      }
      console.log('OFFLINE ONLY: no inference executed. For authorized provider commands see docs/THREE_CASE_QUALITY_REVIEW.md');
    }
  }catch{
    console.error('Quality review unavailable: verify complete matching local reports. No provider calls were made.');
    process.exitCode=1;
  }
}
