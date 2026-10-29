/**
 * Budget-first paid pilot transport guards. Pure injectable interfaces for
 * offline tests: a denied reservation must never invoke the provider caller.
 *
 * These helpers do not hold credentials, send requests on import or arm audio.
 */
export function createGuardedBasetenCaller({reserve,estimate,call}={}){
 if(typeof reserve!=='function'||typeof estimate!=='function'||typeof call!=='function'){
  throw new TypeError('INVALID_BASETEN_GUARD_DEPENDENCIES');
 }
 return async function guardedBasetenCaller(args){
  const reserved=await reserve(estimate(args.prepared),'baseten');
  if(reserved!==true){
   const e=new Error('GLOBAL_PILOT_BUDGET_REACHED');
   e.safeReason='GLOBAL_PILOT_BUDGET_REACHED';
   throw e;
  }
  return call(args);
 };
}

export function createGuardedModalLocalFetch({reserve,fetchImpl,maxUnitUsd=1}={}){
 if(typeof reserve!=='function'||typeof fetchImpl!=='function'||
    typeof maxUnitUsd!=='number'||maxUnitUsd<=0||maxUnitUsd>1){
  throw new TypeError('INVALID_MODAL_GUARD_DEPENDENCIES');
 }
 let remoteUnitCost=null;
 return async function guardedModalFetch(url,opts={}){
  const u=new URL(url);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'){
   throw new Error('SFX_PILOT_LOCAL_ONLY');
  }
  const method=opts.method??'GET';
  if(method==='GET'&&u.pathname==='/api/sfx/status'){
   const response=await fetchImpl(url,opts);
   if(response.ok){
    const config=await response.clone().json();
    const value=config.estimatedMaxCostUsdPerRequest;
    if(typeof value!=='number'||!Number.isFinite(value)||
       value<=0||value>maxUnitUsd){
     throw new Error('MODAL_UNIT_RESERVATION_UNSAFE');
    }
    remoteUnitCost=value;
   }
   return response;
  }
  if(method==='POST'&&u.pathname==='/api/sfx/jobs'){
   if(remoteUnitCost===null)throw new Error('MODAL_COST_STATUS_NOT_VALIDATED');
   if(await reserve(remoteUnitCost,'modal')!==true){
    throw new Error('GLOBAL_PILOT_BUDGET_REACHED');
   }
  }
  return fetchImpl(url,opts);
 };
}
