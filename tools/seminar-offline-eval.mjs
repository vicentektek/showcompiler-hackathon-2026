/**
 * Deterministic evaluation of the original seminar stress corpus.
 * Prints only counts and line identifiers, never the script text.
 * This is not a Meta benchmark; it is the fixed contract/gold readiness gate.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readSeminarCorpus } from './seminarCorpus.mjs';
import { createNewShow } from '../src/core/workspace.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { prepareTheatricalCueAnalysis, THEATRE_MAX_SUGGESTIONS } from '../src/core/theatreCueAnalysis.mjs';

export async function evaluateSeminarCorpus({output='artifacts/seminar-qa'}={}) {
  const corpus=await readSeminarCorpus();
  const items=[];
  for(const sample of corpus.cases){
    const project=createNewShow({name:sample.id,scriptText:sample.scriptText});
    const plan=planScriptAnalysis(sample.scriptText);
    const seen=[];
    const analyses=[];
    for(let windowStart=0;windowStart<plan.windows.length;windowStart++){
      const prepared=prepareTheatricalCueAnalysis(project,{
        windowStart,performanceKind:sample.type,documentKind:sample.documentKind,
        scriptLanguage:sample.language,
      });
      const {request,coverage}=prepared;
      const window=plan.windows[windowStart];
      const explicit=sample.expected.filter(e=>window.coreLines.some(line=>line.id===e.lineId));
      const maxItems=request.response_format.json_schema.schema.properties.proposals.maxItems;
      if(maxItems!==THEATRE_MAX_SUGGESTIONS||
         request.stream!==false||request.store!==false||
         request.response_format.json_schema.strict!==true||
         request.reasoning_effort!=='low'||
         !Array.isArray(coverage.analyzedWindowIds)||coverage.analyzedWindowIds.length!==1){
        throw new Error('Meta contract regression in '+sample.id);
      }
      seen.push(...coverage.analyzedLineIds);
      analyses.push({windowId:window.id,sourceLines:coverage.analyzedLines,
        expectedEvents:explicit.length,maximumSuggestionItems:maxItems,
        saturationRisk:explicit.length>maxItems,
        outputTokenBudget:request.max_completion_tokens,
      });
    }
    if(seen.length!==plan.coverage.totalLines||new Set(seen).size!==seen.length||
       sample.expected.some(e=>!seen.includes(e.lineId))){
      throw new Error('Missing or duplicated source coverage in '+sample.id);
    }
    items.push({id:sample.id,showType:sample.type,documentKind:sample.documentKind,
      scriptLines:plan.coverage.totalLines,sceneCount:plan.scenes.length,
      windowCount:plan.windows.length,
      expectedEvents:sample.expected.length,forbiddenPlay:sample.forbiddenPlayLineIds.length,
      windows:analyses});
  }
  const report={
    kind:'OFFLINE_GOLD_AND_META_CONTRACT_VALIDATION',
    trainedModelEvaluated:false,humanGoldVerified:false,
    provenance:corpus.provenance,
    totals:{scripts:items.length,windows:items.reduce((n,x)=>n+x.windowCount,0),
      expectedEvents:items.reduce((n,x)=>n+x.expectedEvents,0),
      forbiddenPlay:items.reduce((n,x)=>n+x.forbiddenPlay,0),
      possibleCapacityBottlenecks:items.flatMap(c=>c.windows).filter(w=>w.saturationRisk).length},
    cases:items,
  };
  await mkdir(output,{recursive:true});
  await Promise.all([
    writeFile(join(output,'contract.json'),JSON.stringify(report,null,2)+'\n','utf8'),
    writeFile(join(output,'contract.md'),[
      '# RunQ — Seminario / Contrato de análisis (OFFLINE)',
      '',
      '**No son resultados reales de Meta ni gold profesional certificado.**',
      '',
      'Guiones: '+report.totals.scripts+'. Ventanas: '+report.totals.windows+
      '. Eventos esperados: '+report.totals.expectedEvents+
      '. Negativos PLAY: '+report.totals.forbiddenPlay+'.',
      'Ventanas con más eventos esperados que capacidad de salida: '+report.totals.possibleCapacityBottlenecks+'.',
      '',
      '| Caso | Género | Líneas | Ventanas | Eventos | PLAY prohibidos |',
      '|---|---|---:|---:|---:|---:|',
      ...items.map(x=>'| '+x.id+' | '+x.showType+' | '+x.scriptLines+' | '+x.windowCount+' | '+x.expectedEvents+' | '+x.forbiddenPlay+' |'),
      '',
      '### Protocolo para Codex',
      '',
      'La cobertura correcta solo prueba que la solicitud lleva las líneas. Para medir precisión de Muse ejecutar exclusivamente el runner local opt-in, comparar las 4 etiquetas y revisar manualmente los casos ambiguos. Un modelo que devuelve JSON correcto pero pierde STOP o confunde diálogo y PLAY no aprueba el comportamiento artístico.',
      '',
    ].join('\n'),'utf8'),
  ]);
  return report;
}
if(process.argv[1] && /(?:^|[/\\])seminar-offline-eval\.mjs$/.test(process.argv[1])){
  try{
    const r=await evaluateSeminarCorpus();
    console.log('OFFLINE SEMINAR CONTRACT OK — '+r.totals.scripts+' scripts / '+r.totals.windows+' scene windows / '+r.totals.expectedEvents+' annotated events');
    console.log('NO Meta calls. Outputs: artifacts/seminar-qa/contract.{md,json}');
  }catch(err){console.error('Seminar QA: '+(err instanceof Error?err.message:'unknown'));process.exitCode=1;}
}
