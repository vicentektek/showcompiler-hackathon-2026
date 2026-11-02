import test from 'node:test';
import assert from 'node:assert/strict';
import {userFacingError} from '../src/ui/userFacingErrors.mjs';

test('normal UI never exposes raw API keys or internal codes',()=>{
 const secret='SFX_INTERNAL_ERROR with token sk-private-example';
 const msg=userFacingError(new Error(secret),'en');
 assert.doesNotMatch(msg,/sk-private|SFX_INTERNAL|MODEL_API_KEY|HTTP_/);
 assert.match(msg,/could not be completed/);
});
test('known connection and cost failures provide actionable messages',()=>{
 assert.match(userFacingError('SFX_NOT_CONFIGURED','en'),/connection settings/);
 assert.match(userFacingError('SFX_DAILY_BUDGET','es'),/límite de gasto/);
 assert.match(userFacingError('HTTP 429','en'),/usage limit/);
 assert.match(userFacingError('MODEL_API_KEY','en'),/could not/);
});
test('handles locale and audio validation errors',()=>{
 assert.match(userFacingError('Audio must be 1–20 MB and decodable by Chromium','en','audio'),/audio file/i);
 assert.match(userFacingError('FAILED TO FETCH','es'),/conectar/);
 assert.match(userFacingError(null,'es'),/No se ha podido/);
 assert.match(userFacingError('HTTP 500','en','sound'),/check its status/);
});
test('sound assignment errors explain the recovery without exposing internals',()=>{
 assert.match(userFacingError('SFX_ALREADY_IMPORTED','en','sound'),/already in the library.*assign/);
 assert.match(userFacingError('SFX_NOT_REVIEWABLE','es','sound'),/Comprueba su estado/);
 assert.match(userFacingError('SFX_IDENTITY','en','sound'),/Reopen it/);
});
test('assistant audio validation explains incompatible settings without reflecting provider content',()=>{
 assert.match(userFacingError('LOOP_NEEDS_TARGETED_STOP','en'),/another cue.*fade/);
 assert.match(userFacingError('AUDIO_ASSET_UNAVAILABLE','es'),/Carga y decodifica/);
 assert.match(userFacingError('INVALID_STOP_TARGET','en'),/different.*existing cue/);
 assert.match(userFacingError('AGENT_PLAN_FAILED','es'),/Revisa audio/);
 assert.match(userFacingError('AGENT_PLAN_NO_CHANGES','en'),/already applied/);
});
