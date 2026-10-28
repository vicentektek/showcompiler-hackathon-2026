const MODEL_CANDIDATES=new Set([
  'stabilityai/stable-audio-3-small-sfx',
  'stabilityai/stable-audio-3-medium',
  'ResembleAI/chatterbox',
  'ResembleAI/Chatterbox-Multilingual-es-es',
  'ACE-Step/Ace-Step1.5',
]);
const KINDS=new Set(['SFX','ENVIRONMENT','VOICEOVER','MUSIC']);
const LINE=/^L[1-9]\d*$/;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const REMOTE_REFERENCE=/(?:https?|data|file):/i;

function text(value,name,max){
  if(typeof value!=='string'||!value.trim()||value.length>max||REMOTE_REFERENCE.test(value))
    throw new TypeError('Invalid '+name);
  return value.trim();
}
function positive(value,name,max){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>max)
    throw new TypeError('Invalid '+name);
  return value;
}

/** Pure preparation contract: no network, persistence, asset binding or transport action. */
export function prepareAudioGenerationPlan(input={}){
  if(!LINE.test(input.sourceLineId??'')||!KINDS.has(input.kind)||
    !MODEL_CANDIDATES.has(input.modelCandidate))throw new TypeError('Invalid generation plan');
  const common={contractVersion:1,phase:'PREPARATION_ONLY',
    status:'AWAITING_OPERATOR_AUTHORIZATION',automaticSubmission:false,
    sourceLineId:input.sourceLineId,kind:input.kind,modelCandidate:input.modelCandidate};
  if(input.kind==='VOICEOVER'){
    return {...common,voiceover:{text:text(input.text,'voiceover text',2000),
      voice:text(input.voice,'voice',120),language:text(input.language,'language',35)}};
  }
  const durationSeconds=input.durationSeconds===undefined?null:
    positive(input.durationSeconds,'duration',600);
  return {...common,prompt:text(input.prompt,'audio prompt',1000),durationSeconds};
}

/** Records one operator authorization. Submission remains the responsibility of a future adapter. */
export function authorizeAudioGenerationPlan(plan={},authorization={}){
  if(plan.status!=='AWAITING_OPERATOR_AUTHORIZATION'||plan.phase!=='PREPARATION_ONLY'||
    authorization.confirmed!==true||!SAFE_ID.test(authorization.authorizationId??''))
    throw new TypeError('Explicit one-request authorization required');
  return {...plan,status:'AUTHORIZED_FOR_ONE_GENERATION',
    authorization:{id:authorization.authorizationId,scope:'ONE_GENERATION_REQUEST'}};
}

/** Captures generated WAV metadata for later manual import; it never creates a playable asset. */
export function recordGeneratedWav(plan={},wav={}){
  if(plan.status!=='AUTHORIZED_FOR_ONE_GENERATION'||typeof wav.fileName!=='string'||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,115}\.wav$/i.test(wav.fileName)||
    !/^[a-f0-9]{64}$/i.test(wav.sha256??'')||
    !Number.isSafeInteger(wav.sampleRateHz)||wav.sampleRateHz<8000||wav.sampleRateHz>384000||
    !Number.isSafeInteger(wav.channels)||wav.channels<1||wav.channels>8)
    throw new TypeError('Invalid generated WAV metadata');
  const durationSeconds=positive(wav.durationSeconds,'WAV duration',3600);
  return {...plan,status:'AWAITING_OPERATOR_IMPORT',generatedWav:{
    fileName:wav.fileName,sha256:wav.sha256.toLowerCase(),durationSeconds,
    sampleRateHz:wav.sampleRateHz,channels:wav.channels,
  }};
}
