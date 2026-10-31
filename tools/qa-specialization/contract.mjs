// Bridge between the specialization corpus and the REAL RUNQ agent contract
// (tools/agentRoutes.mjs wire schema -> src/core/agentCore.mjs operations). Offline, no network.
import {AGENT_OUTPUT_SCHEMA,AGENT_SYSTEM_PROMPT} from '../agentRoutes.mjs';
import {prepareAgentPlan,commitAgentPlan} from '../../src/core/agentCore.mjs';
import {judgeCase,judgeProject} from '../theatreEvalCases.mjs';

export const STATUSES=AGENT_OUTPUT_SCHEMA.properties.status.enum;
const OP_PROPS=AGENT_OUTPUT_SCHEMA.properties.operations.items.properties;
export const OPS=OP_PROPS.op.enum;
export const EDIT_FIELDS=OP_PROPS.edits.items.properties.field.enum;
const OP_KEYS=Object.keys(OP_PROPS);

const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);

// Same shape the model must return (all keys present, unused ones null, edits []).
export function wireOperation(partial){
  const op={op:null,cueId:null,afterCueId:null,targetCueId:null,position:null,label:null,edits:[]};
  return Object.assign(op,partial);
}
export const edit=(field,value)=>({field,numeric:typeof value==='number'?value:null,
  text:typeof value==='string'?value:null,boolean:typeof value==='boolean'?value:null});

// Structural validation of a wire-format target against the real schema and a real context.
export function validateWireTarget(target,context){
  const errors=[];
  if(!isObj(target)||Object.keys(target).sort().join()!=='message,operations,status')return ['TARGET_SHAPE'];
  if(!STATUSES.includes(target.status))errors.push('BAD_STATUS');
  if(typeof target.message!=='string'||target.message.length>1000)errors.push('BAD_MESSAGE');
  if(!Array.isArray(target.operations)||target.operations.length>20)return [...errors,'BAD_OPERATIONS'];
  if(target.status!=='PLAN'&&target.operations.length)errors.push('NON_PLAN_WITH_OPERATIONS');
  if(target.status==='PLAN'&&!target.operations.length)errors.push('EMPTY_PLAN');
  const ids=new Set((context?.cues??[]).map(c=>c.id));
  for(const o of target.operations){
    if(!isObj(o)||Object.keys(o).sort().join()!==[...OP_KEYS].sort().join()){errors.push('OP_SHAPE');continue;}
    if(!OPS.includes(o.op))errors.push('BAD_OP');
    if(!Array.isArray(o.edits)||o.edits.length>8)errors.push('BAD_EDITS');
    for(const e of o.edits??[]){
      if(!isObj(e)||!EDIT_FIELDS.includes(e.field))errors.push('BAD_EDIT_FIELD');
      else if([e.numeric,e.text,e.boolean].filter(v=>v!==null&&v!==undefined).length!==1)errors.push('BAD_EDIT_VALUE');
    }
    for(const k of ['cueId','afterCueId','targetCueId'])if(o[k]&&!ids.has(o[k]))errors.push('CUE_NOT_IN_CONTEXT:'+k);
    if(o.position!==null&&!['before','after'].includes(o.position))errors.push('BAD_POSITION');
  }
  return [...new Set(errors)];
}

// Equivalent of decode() in agentRoutes: wire operations -> agentCore operations.
export function wireToOperations(target){
  return target.operations.map(o=>{
    if(o.op==='UPDATE_CUE'){
      const changes={};
      for(const e of o.edits)changes[e.field]=[e.numeric,e.text,e.boolean].find(v=>v!==null&&v!==undefined);
      return {op:o.op,cueId:o.cueId,changes};
    }
    if(o.op==='DELETE_CUE')return {op:o.op,cueId:o.cueId};
    if(o.op==='CREATE_CUE')return {op:o.op,label:o.label,afterCueId:o.afterCueId};
    return {op:o.op,cueId:o.cueId,targetCueId:o.targetCueId,position:o.position};
  });
}

// The exact messages the real route sends (developer prompt + user JSON).
export function routeMessages(row){
  return [
    {role:'developer',content:AGENT_SYSTEM_PROMPT},
    {role:'user',content:JSON.stringify({instruction:row.instruction,language:row.language,
      conversation:(row.conversation??[]).map(t=>({role:t.role,text:t.text})),context:row.context})},
  ];
}

// Deterministic reference targets for functions whose single correct plan is unambiguous.
// NOTES / TRIGGER / ANSWER / ART need a human-authored target and are intentionally not generated.
export function buildReferenceTarget(c,project){
  const cue=n=>project.cues[n-1]?.id;
  const e=c.expect,es=c.language==='es';
  switch(e.kind){
    case 'DELETE':return {status:'PLAN',message:es?'Propongo eliminar ese cue.':'I propose deleting that cue.',
      operations:[wireOperation({op:'DELETE_CUE',cueId:cue(e.n)})]};
    case 'MOVE':return {status:'PLAN',message:es?'Propongo moverlo.':'I propose moving it.',
      operations:[wireOperation({op:'REORDER_CUE',cueId:cue(e.n),targetCueId:cue(e.m),position:e.after?'after':'before'})]};
    case 'UPDATE':return {status:'PLAN',message:es?'Propongo este ajuste.':'I propose this adjustment.',
      operations:[wireOperation({op:'UPDATE_CUE',cueId:cue(e.n),edits:Object.entries(e.playback).map(([k,v])=>edit(k,v))})]};
    case 'RENAME':return {status:'PLAN',message:es?'Propongo renombrarlo.':'I propose renaming it.',
      operations:[wireOperation({op:'UPDATE_CUE',cueId:cue(e.n),edits:[edit('label',e.label)]})]};
    case 'CREATE_NAMED':return {status:'PLAN',message:es?'Propongo un cue manual nuevo; el audio queda sin configurar.':'I propose a new manual cue; its audio stays unconfigured.',
      operations:[wireOperation({op:'CREATE_CUE',label:e.label,afterCueId:project.cues.at(-1).id})]};
    case 'CREATE_COUNT':return {status:'PLAN',message:es?'Propongo cues manuales vacíos; el audio queda sin configurar.':'I propose empty manual cues; their audio stays unconfigured.',
      operations:Array.from({length:e.count},(_,i)=>wireOperation({op:'CREATE_CUE',label:(es?'Nuevo cue ':'New cue ')+(i+1),afterCueId:project.cues.at(-1).id}))};
    case 'NOOP':{
      if(!e.statuses.includes('ANSWER')&&e.statuses.includes('CLARIFY'))
        return {status:'CLARIFY',message:es?'Hay varios cues que encajan; ¿a cuál te refieres?':'Several cues match; which one do you mean?',operations:[]};
      return {status:'ANSWER',message:es?'No voy a cambiar nada con esa petición; ni ejecuto GO/STOP ni toco cues inexistentes.'
        :'I will not change anything for that request; I never run GO/STOP or touch cues that do not exist.',operations:[]};
    }
    default:return null;
  }
}

// Verifies a target end to end: judge on the response AND exact modification on a project copy.
export function verifyTarget(c,project,target){
  const response={httpStatus:200,...target,operations:wireToOperations(target)};
  const metrics=judgeCase(c,project,response);
  let final=project,projectFailure=null;
  if(target.status==='PLAN'){
    try{final=commitAgentPlan(project,prepareAgentPlan(project,response.operations),{editable:true}).project;}
    catch(error){projectFailure='PLAN_REJECTED_BY_VALIDATOR:'+(error?.code??error?.message);}
  }
  projectFailure??=judgeProject(project,final,c.expect);
  return {ok:metrics.interpretation===true&&!metrics.unauthorized&&projectFailure===null,metrics,projectFailure};
}
