#!/usr/bin/env node
import {readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const env={...process.env,RUNQ_OFFLINE_TESTS:'1'};
for(const key of ['MODEL_API_KEY','BASETEN_API_KEY','FIREWORKS_API_KEY','MODAL_PROXY_TOKEN_ID',
 'MODAL_PROXY_TOKEN_SECRET','RUNQ_SFX_PILOT_ENABLED'])delete env[key];
const files=readdirSync(resolve('test')).filter(name=>name.endsWith('.test.mjs'))
 .sort().map(name=>'test/'+name);
const child=spawn(process.execPath,['--test',...files],{cwd:resolve('.'),env,stdio:'inherit'});
child.once('error',error=>{console.error('OFFLINE_TEST_RUNNER_FAILED',error.code??error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
