import test from 'node:test';
import assert from 'node:assert/strict';
import {readScriptDocument,MAX_SCRIPT_DOCUMENT_BYTES} from '../src/core/scriptDocumentImport.mjs';

const fake=(name,bytes)=>({
  name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer,
});
const bytes=s=>[...new TextEncoder().encode(s)];

test('TXT import retains script lines and rejects malformed UTF-8',async()=>{
  const result=await readScriptDocument(fake('show.TXT',bytes('ESCENA 1\r\nANA: Adelante.')));
  assert.deepEqual(result,{text:'ESCENA 1\nANA: Adelante.',format:'txt'});
  await assert.rejects(readScriptDocument(fake('wrong.txt',[0xff,0xfe])),/SCRIPT_INVALID_UTF8/);
});
test('PDF importer extracts page text, respects line endings and destroys document',async()=>{
  let destroyed=false,workerArg;
  const file=fake('show.pdf',bytes('%PDF-1.7 fake'));
  const pdf={numPages:2,
    getPage:async n=>({getTextContent:async()=>({items:n===1
      ?[{str:'ESCENA 1',hasEOL:true},{str:'ANA:',hasEOL:false},{str:'Vamos',hasEOL:true}]
      :[{str:'(Suena la campana)',hasEOL:true}]})}),
    destroy:async()=>{destroyed=true;}};
  const result=await readScriptDocument(file,{loadPdf:async()=>({
    getDocument:arg=>{workerArg=arg;return{promise:Promise.resolve(pdf),destroy:async()=>{}};}
  })});
  assert.equal(result.format,'pdf');
  assert.equal(result.pages,2);
  assert.match(result.text,/ESCENA 1\nANA: Vamos\n\(Suena la campana\)/);
  assert.equal(destroyed,true);
  assert.equal(workerArg.isEvalSupported,false);
});
test('Scanned PDF without extractable text is reported, not silently accepted',async()=>{
  const file=fake('scan.pdf',bytes('%PDF-1.5'));
  await assert.rejects(readScriptDocument(file,{loadPdf:async()=>({
    getDocument:()=>({promise:Promise.resolve({numPages:1,
      getPage:async()=>({getTextContent:async()=>({items:[]})}),destroy:async()=>{}})})
  })}),/SCRIPT_NO_EXTRACTABLE_TEXT/);
});
test('DOCX importer reads local raw text and explicitly rejects legacy .doc',async()=>{
  const file=fake('scene.docx',[0x50,0x4b,0x03,0x04,0,1]);
  const out=await readScriptDocument(file,{loadWord:async()=>({
    extractRawText:async({arrayBuffer})=>{assert.equal(arrayBuffer.byteLength,6);return{value:'ESCENA 2\nANA: Hola.'};}
  })});
  assert.equal(out.text,'ESCENA 2\nANA: Hola.');
  await assert.rejects(readScriptDocument(fake('legacy.doc',bytes('old'))),/SCRIPT_UNSUPPORTED_FORMAT/);
  await assert.rejects(readScriptDocument(fake('fake.docx',bytes('not a zip'))),/SCRIPT_INVALID_DOCX/);
});
test('document size, PDF page count and text limits reject before show replacement',async()=>{
  const oversized={name:'long.pdf',size:MAX_SCRIPT_DOCUMENT_BYTES+1,arrayBuffer:async()=>{throw Error('must not read');}};
  await assert.rejects(readScriptDocument(oversized),/SCRIPT_DOCUMENT_TOO_LARGE/);
  await assert.rejects(readScriptDocument(fake('too-many.pdf',bytes('%PDF-1.7')),{loadPdf:async()=>({
    getDocument:()=>({promise:Promise.resolve({numPages:121,destroy:async()=>{}})})
  })}),/SCRIPT_PDF_PAGE_LIMIT/);
});
