#!/usr/bin/env node
/** Offline only. No API credentials or requests. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {compareProviderReports} from './basetenSeminarEval.mjs';
import {readSeminarCorpus} from './seminarCorpus.mjs';
try{
  const [meta,baseten,corpus]=await Promise.all([
    readFile('artifacts/seminar-live/report.json','utf8').then(JSON.parse),
    readFile('artifacts/seminar-baseten/report.json','utf8').then(JSON.parse),
    readSeminarCorpus(),
  ]);
  const result=compareProviderReports(meta,baseten,corpus);
  await mkdir('artifacts/seminar-compare',{recursive:true});
  await writeFile('artifacts/seminar-compare/report.json',JSON.stringify(result,null,2)+'\n');
  console.log('Paired cases: '+result.casesCompared);
  if(result.comparable){
    console.log('Meta F1: '+result.meta.f1.toFixed(4)+'; Baseten F1: '+result.baseten.f1.toFixed(4));
    console.log('Other dimensions: artifacts/seminar-compare/report.json');
  }else{
    console.log('No identical completed cases available. Do not compare unpaired scores.');
  }
}catch{
  console.error('Comparison unavailable; create both local reports first. No network call made.');
  process.exitCode=1;
}
