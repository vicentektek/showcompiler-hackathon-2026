/**
 * Local-only theatre script text import. No file bytes leave the browser.
 * PDF and DOCX use pinned local libraries; legacy binary .doc is unsupported.
 * The returned text is a plain UTF-8 script suitable for Lxx source tracking.
 */
export const MAX_SCRIPT_TEXT_CHARS = 1_000_000;
export const MAX_SCRIPT_DOCUMENT_BYTES = 16_000_000;
export const MAX_PDF_PAGES = 120;
const kindFor = name => /\.(txt|pdf|docx)$/i.exec(String(name??''))?.[1]?.toLowerCase()??null;

let mammothPromise;
async function loadWordBrowser(){
  if(globalThis.mammoth?.extractRawText)return globalThis.mammoth;
  if(!mammothPromise){
    mammothPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/vendor/mammoth/mammoth.browser.min.js';
      script.async=true;
      script.onload=()=>globalThis.mammoth?.extractRawText
        ? resolve(globalThis.mammoth)
        : reject(new Error('DOCX_LIBRARY_UNAVAILABLE'));
      script.onerror=()=>reject(new Error('DOCX_LIBRARY_UNAVAILABLE'));
      document.head.append(script);
    }).catch(error=>{mammothPromise=null;throw error;});
  }
  return mammothPromise;
}
async function loadPdfBrowser(){
  const pdfjs=await import('/vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
  return pdfjs;
}
function finalize(text){
  if(typeof text!=='string')throw new Error('SCRIPT_NO_EXTRACTABLE_TEXT');
  const cleaned=text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
  if(!cleaned)throw new Error('SCRIPT_NO_EXTRACTABLE_TEXT');
  if(cleaned.length>MAX_SCRIPT_TEXT_CHARS)throw new Error('SCRIPT_TEXT_TOO_LARGE');
  return cleaned;
}
function pdfPageText(items){
  const rows=[];
  let line='';
  for(const item of items??[]){
    const value=typeof item?.str==='string'?item.str:'';
    if(value){
      if(line&&!/\s$/.test(line)&&!/^\s/.test(value))line+=' ';
      line+=value;
    }
    if(item?.hasEOL){
      if(line.trim())rows.push(line.trimEnd());
      line='';
    }
  }
  if(line.trim())rows.push(line.trimEnd());
  return rows.join('\n');
}
/** Inject loaders in tests; in production both imports resolve on this server. */
export async function readScriptDocument(file,{loadPdf=loadPdfBrowser,loadWord=loadWordBrowser}={}){
  const type=kindFor(file?.name);
  if(!type)throw new Error('SCRIPT_UNSUPPORTED_FORMAT');
  if(!Number.isFinite(file?.size)||file.size<=0||file.size>MAX_SCRIPT_DOCUMENT_BYTES)
    throw new Error('SCRIPT_DOCUMENT_TOO_LARGE');
  if(type==='txt'&&file.size>MAX_SCRIPT_TEXT_CHARS*4)
    throw new Error('SCRIPT_TEXT_TOO_LARGE');
  const bytes=await file.arrayBuffer();
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==file.size)
    throw new Error('SCRIPT_DOCUMENT_UNREADABLE');
  if(type==='txt'){
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{throw new Error('SCRIPT_INVALID_UTF8');}
    return {text:finalize(text),format:type};
  }
  if(type==='docx'){
    // The ZIP signature prevents treating a renamed .doc or a text file as DOCX.
    const head=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
    if(head.length<4||head[0]!==0x50||head[1]!==0x4b)
      throw new Error('SCRIPT_INVALID_DOCX');
    const mammoth=await loadWord();
    const result=await mammoth.extractRawText({arrayBuffer:bytes});
    return {text:finalize(result.value),format:type};
  }
  if(new TextDecoder('latin1').decode(bytes.slice(0,5))!=='%PDF-')
    throw new Error('SCRIPT_INVALID_PDF');
  const pdfjs=await loadPdf();
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});
  let pdf;
  try{
    pdf=await task.promise;
    if(pdf.numPages<1||pdf.numPages>MAX_PDF_PAGES)
      throw new Error('SCRIPT_PDF_PAGE_LIMIT');
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      pages.push(pdfPageText(content.items));
      if(pages.reduce((sum,s)=>sum+s.length,0)>MAX_SCRIPT_TEXT_CHARS)
        throw new Error('SCRIPT_TEXT_TOO_LARGE');
    }
    return {text:finalize(pages.join('\n')),format:type,pages:pdf.numPages};
  }finally{
    // PDF.js versions expose cleanup on the loading task; some document
    // proxies no longer implement destroy() themselves.
    if(typeof pdf?.destroy==='function')await pdf.destroy();
    else if(typeof task.destroy==='function')await task.destroy();
  }
}
