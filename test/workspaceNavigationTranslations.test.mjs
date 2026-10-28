import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/ui/locales/en.json' with {type:'json'};
import es from '../src/ui/locales/es.json' with {type:'json'};
import { translate } from '../src/ui/i18n.mjs';

const workspaces=['home','script','ai','cues','audio','soundlab','setup','rehearsal','operation'];
for(const [locale,catalog] of [['en',en],['es',es]]){
 test(`all workspace navigation titles/descriptions exist in ${locale}`,()=>{
   for(const workspace of workspaces){
     for(const key of ['workspace.'+workspace,'workspace.description.'+workspace]){
       assert.ok(Object.hasOwn(catalog,key),`Missing ${locale} translation: ${key}`);
       assert.equal(typeof translate(locale,key),'string');
       assert.ok(translate(locale,key).trim());
     }
   }
 });
}
