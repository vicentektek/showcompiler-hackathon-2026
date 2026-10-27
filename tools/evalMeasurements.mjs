const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const rounded=n=>Number(n.toFixed(3));

/** Aggregate only sanitized request diagnostics already retained by a provider adapter. */
export function summarizeEvaluationRequests(cases=[]){
  if(!Array.isArray(cases))throw new TypeError('Invalid evaluation cases');
  const requests=cases.flatMap(item=>Array.isArray(item?.requests)?item.requests:[]);
  const latencies=[];
  const tokens={requestsWithUsage:0,prompt:0,completion:0,reasoning:0,cachedPrompt:0};
  const statuses={};
  const finishReasons={};
  for(const request of requests){
    const diagnostics=request?.diagnostics&&typeof request.diagnostics==='object'?
      request.diagnostics:request;
    const status=typeof request?.status==='string'?request.status:'UNKNOWN';
    statuses[status]=(statuses[status]??0)+1;
    const finish=typeof diagnostics?.finishReason==='string'?diagnostics.finishReason:null;
    if(finish)finishReasons[finish]=(finishReasons[finish]??0)+1;
    const duration=count(diagnostics?.durationMs);
    if(duration!==null)latencies.push(duration);
    const usage=diagnostics?.usage;
    if(usage&&typeof usage==='object'){
      const prompt=count(usage.promptTokens),completion=count(usage.completionTokens);
      const reasoning=count(usage.reasoningTokens),cached=count(usage.cachedPromptTokens);
      if([prompt,completion,reasoning,cached].some(value=>value!==null))tokens.requestsWithUsage++;
      tokens.prompt+=prompt??0;tokens.completion+=completion??0;
      tokens.reasoning+=reasoning??0;tokens.cachedPrompt+=cached??0;
    }
  }
  const total=latencies.reduce((sum,value)=>sum+value,0);
  return {
    requests:requests.length,statuses,finishReasons,
    latencyMs:{sampled:latencies.length,total,
      average:latencies.length?rounded(total/latencies.length):null,
      maximum:latencies.length?Math.max(...latencies):null},
    tokens,
  };
}
