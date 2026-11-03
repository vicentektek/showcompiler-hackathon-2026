/** Real browser import acceptance: TXT, text-PDF, DOCX. Local only; no provider calls. */
import assert from 'node:assert/strict';
import {createAppServer} from './dev-server.mjs';
import {crc32} from '../src/core/zipStore.mjs';
import {chromium} from 'playwright-core';

function pdfWithText(sentence){
 const stream='BT /F1 14 Tf 40 730 Td ('+sentence.replace(/[\\()]/g,'\\$&')+') Tj ET';
 const objs=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'
 ];
 let data='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objs.length;i++){
  offsets.push(Buffer.byteLength(data));
  data+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n';
 }
 const xref=Buffer.byteLength(data);
 data+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
 for(const off of offsets.slice(1))data+=String(off).padStart(10,'0')+' 00000 n \n';
 data+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(data);
}
function zipStore(entries){
 const local=[],central=[];let offset=0;
 for(const [name,value] of entries){
  const file=Buffer.from(value),nm=Buffer.from(name),crc=crc32(new Uint8Array(file));
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);
  h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(file.length,18);
  h.writeUInt32LE(file.length,22);h.writeUInt16LE(nm.length,26);
  local.push(h,nm,file);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);
  c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
  c.writeUInt32LE(crc,16);c.writeUInt32LE(file.length,20);
  c.writeUInt32LE(file.length,24);c.writeUInt16LE(nm.length,28);
  c.writeUInt32LE(offset,42);central.push(c,nm);
  offset+=h.length+nm.length+file.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);
 end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);
 end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,cd,end]);
}
function wordDocument(){
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  +'<w:p><w:r><w:t>ESCENA CUATRO</w:t></w:r></w:p>'
  +'<w:p><w:r><w:t>ANA: LISTOS PARA EL ENSAYO</w:t></w:r></w:p>'
  +'</w:body></w:document>';
 const types='<?xml version="1.0" encoding="UTF-8"?>'
  +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  +'<Default Extension="xml" ContentType="application/xml"/>'
  +'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  +'</Types>';
 const rels='<?xml version="1.0" encoding="UTF-8"?>'
  +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  +'</Relationships>';
 return zipStore([['[Content_Types].xml',types],['_rels/.rels',rels],['word/document.xml',xml]]);
}

const cases=[
 {name:'obra.txt',mimeType:'text/plain',buffer:Buffer.from('ESCENA UNO\nANA: ADELANTE'),expect:/ESCENA UNO[\s\S]*ANA: ADELANTE/},
 {name:'obra.pdf',mimeType:'application/pdf',buffer:pdfWithText('ESCENA TRES PUERTA ABIERTA'),expect:/ESCENA TRES PUERTA ABIERTA/},
 {name:'obra.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:wordDocument(),expect:/ESCENA CUATRO[\s\S]*ANA: LISTOS PARA EL ENSAYO/}
];
const server=createAppServer();let browser;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 for(const item of cases){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#scriptFileInput').setInputFiles(item);
  await page.waitForFunction(()=>document.querySelector('#showName')?.value==='obra',{timeout:12000});
  const project=await page.evaluate(()=>{
   let state;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>{state=v;}}}));
   return state?.project;
  });
  assert.match(project.scriptText,item.expect,'Extractable '+item.name+' content must reach original script');
  assert.deepEqual(errors,[],'No page exceptions while reading '+item.name);
  await page.close();
 }
 console.log('SCRIPT_FORMATS_BROWSER_PASS: real TXT, PDF.js text extraction and Mammoth DOCX, local-only');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
