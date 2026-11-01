/**
 * Audio-only ZIP intake, intentionally independent of strict SHOWCOMPILER show
 * archive import. Handles normal ZIP STORE and DEFLATE (not RAR/ZIP64).
 * Local only, bounded memory, read-only archive parsing, no filesystem paths.
 */
import { crc32 } from './zipStore.mjs';

export const MAX_AUDIO_BATCH_FILES = 100;
export const MAX_AUDIO_ZIP_BYTES = 64_000_000;
export const MAX_BATCH_TOTAL_BYTES = 100_000_000;
export const MAX_AUDIO_FILE_BYTES = 20_000_000;
const MAX_ARCHIVE_ENTRIES = 140;
const AUDIO_EXT = /\.(?:wav|mp3|ogg|m4a|aac|flac)$/i;
const fatalUtf8 = new TextDecoder('utf-8',{fatal:true});
const HEAD_LOCAL = 0x04034b50;
const HEAD_CENTRAL = 0x02014b50;
const HEAD_END = 0x06054b50;
const HEAD_DESCRIPTOR = 0x08074b50;
const err = message => new TypeError('Audio ZIP: '+message);
const read16=(v,pos)=>v.getUint16(pos,true);
const read32=(v,pos)=>v.getUint32(pos,true);
function nameFromZip(bytes){
  try{return fatalUtf8.decode(bytes)}
  catch{throw err('file names must be UTF-8')}
}
function safeEntryName(value){
  if(!value || value.includes('\\') || value.startsWith('/') ||
      /^[A-Za-z]:/.test(value) || value.includes('\0') ||
      /[\x00-\x1F\x7F]/.test(value) ||
      value.split('/').some(s=>s==='.'||s==='..'||s==='') &&
      !value.endsWith('/') )throw err('unsafe archive path');
  const segments=value.split('/');
  if(segments.some((s,i)=>i<segments.length-1 && (s==='.'||s==='..'||s==='')))throw err('unsafe archive folder');
  return value;
}
function parseZipDirectory(input){
  if(!(input instanceof Uint8Array) || input.byteLength<22 ||
      input.byteLength>MAX_AUDIO_ZIP_BYTES)throw err('archive must be 1–64 MB');
  const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
  // The end-of-central-directory may contain a user comment.
  let end=-1;
  for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--){
    if(read32(view,i)===HEAD_END && i+22+read16(view,i+20)===input.length){end=i;break}
  }
  if(end<0 || read16(view,end+4)!==0 || read16(view,end+6)!==0)
    throw err('invalid ZIP directory or multi-volume archive');
  const count=read16(view,end+10);
  if(count<1||count>MAX_ARCHIVE_ENTRIES||count!==read16(view,end+8))
    throw err('too many files or invalid entry count');
  const size=read32(view,end+12),offset=read32(view,end+16);
  if(offset===0xffffffff||size===0xffffffff||offset+size!==end)
    throw err('unsupported ZIP64 or invalid central directory');
  const records=[];const seen=new Set();
  let ptr=offset,claimedTotal=0;
  for(let i=0;i<count;i++){
    if(ptr+46>end || read32(view,ptr)!==HEAD_CENTRAL)throw err('invalid central directory entry');
    const flags=read16(view,ptr+8),method=read16(view,ptr+10);
    const crc=read32(view,ptr+16);
    const compressed=read32(view,ptr+20),uncompressed=read32(view,ptr+24);
    const nameSize=read16(view,ptr+28),extra=read16(view,ptr+30),comment=read16(view,ptr+32);
    const createdBy=read16(view,ptr+4)>>8,attributes=read32(view,ptr+38);
    const local=read32(view,ptr+42);
    const next=ptr+46+nameSize+extra+comment;
    if(!nameSize || next>end || compressed===0xffffffff || uncompressed===0xffffffff ||
       local===0xffffffff || (flags&0x41)!==0)throw err('encrypted, ZIP64 or truncated entry');
    const path=safeEntryName(nameFromZip(input.subarray(ptr+46,ptr+46+nameSize)));
    if(seen.has(path.toLowerCase()))throw err('duplicate archive path');
    seen.add(path.toLowerCase());
    if(createdBy===3 && ((attributes>>>16)&0o170000)===0o120000)
      throw err('symbolic links are not allowed');
    if(local+30>offset || read32(view,local)!==HEAD_LOCAL ||
       read16(view,local+6)!==flags || read16(view,local+8)!==method)
      throw err('mismatched local ZIP header');
    const localNameSize=read16(view,local+26),localExtra=read16(view,local+28);
    const dataStart=local+30+localNameSize+localExtra;
    const dataEnd=dataStart+compressed;
    if(dataEnd>offset || dataStart<local+30 ||
       nameFromZip(input.subarray(local+30,local+30+localNameSize))!==path)
      throw err('invalid ZIP member bounds or name');
    if(!(flags&0x08) &&
       (read32(view,local+14)!==crc || read32(view,local+18)!==compressed ||
        read32(view,local+22)!==uncompressed))
      throw err('inconsistent ZIP sizes or checksum');
    let memberEnd=dataEnd;
    if(flags&0x08){
      let d=dataEnd;
      if(d+4<=offset && read32(view,d)===HEAD_DESCRIPTOR)d+=4;
      if(d+12>offset || read32(view,d)!==crc ||
         read32(view,d+4)!==compressed || read32(view,d+8)!==uncompressed)
        throw err('invalid ZIP data descriptor');
      memberEnd=d+12;
    }
    records.push({path,compressed,uncompressed,method,crc,start:dataStart,
      range:[local,memberEnd],directory:path.endsWith('/')});
    claimedTotal+=uncompressed;
    if(claimedTotal>MAX_BATCH_TOTAL_BYTES+20_000_000)
      throw err('uncompressed archive exceeds memory budget');
    ptr=next;
  }
  if(ptr!==end)throw err('hidden ZIP directory bytes');
  const spans=records.map(r=>r.range).sort((a,b)=>a[0]-b[0]);
  let previous=0;
  for(const [start,finish] of spans){
    if(start!==previous || finish<start)throw err('overlapping or hidden archive content');
    previous=finish;
  }
  if(previous!==offset)throw err('unreferenced bytes before directory');
  if(records.some(r=>r.path==='project.json'||r.path==='manifest.json'))
    throw err('this is a RunQ show package; use Open show ZIP instead');
  return records;
}
async function inflateBounded(bytes,expected){
  if(typeof DecompressionStream!=='function')throw err('this browser cannot unpack compressed ZIP audio');
  let stream;
  try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))}
  catch{throw err('DEFLATE-RAW is not supported in this browser')}
  const reader=stream.getReader(),parts=[];
  let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>expected || length>MAX_AUDIO_FILE_BYTES)
        throw err('entry decompresses beyond declared limit');
      parts.push(value);
    }
  }catch(e){await reader.cancel().catch(()=>{});throw e}
  if(length!==expected)throw err('entry decompressed size mismatch');
  const result=new Uint8Array(length);
  let at=0;for(const part of parts){result.set(part,at);at+=part.length}
  return result;
}
/** Returns actual local File objects, and individual skipped entries.
 * No file content is committed to the show until the decoder accepts it.
 */
export async function extractAudioZip(bytes){
  const records=parseZipDirectory(bytes);
  const files=[],skipped=[];
  const seenNames=new Set();
  let aggregate=0;
  for(const item of records){
    if(item.directory)continue;
    const name=item.path.split('/').at(-1);
    if(item.path.split('/').some(s=>s==='__MACOSX'||s.startsWith('.')) ||
       !AUDIO_EXT.test(name)){
      skipped.push({name:item.path,reason:'not an audio file'});continue;
    }
    if(name.length>200 || /[\x00-\x1F\x7F/\\]/.test(name)){
      skipped.push({name:item.path,reason:'unsupported audio filename'});continue;
    }
    if(seenNames.has(name.toLocaleLowerCase())){
      skipped.push({name:item.path,reason:'same filename in another ZIP folder'});continue;
    }
    seenNames.add(name.toLocaleLowerCase());
    if(files.length>=MAX_AUDIO_BATCH_FILES){
      skipped.push({name,reason:'maximum 100 audio files per batch'});continue;
    }
    if(item.uncompressed<1 || item.uncompressed>MAX_AUDIO_FILE_BYTES ||
       aggregate+item.uncompressed>MAX_BATCH_TOTAL_BYTES){
      skipped.push({name,reason:'audio file or batch exceeds size limit'});continue;
    }
    if(item.method!==0&&item.method!==8){
      skipped.push({name,reason:'unsupported ZIP compression method'});continue;
    }
    try{
      const compressed=bytes.subarray(item.start,item.start+item.compressed);
      const decoded=item.method===0?compressed.slice():await inflateBounded(compressed,item.uncompressed);
      if(decoded.byteLength!==item.uncompressed||crc32(decoded)!==item.crc)
        throw err('CRC/checksum mismatch');
      files.push(new File([decoded],name,{type:'application/octet-stream'}));
      aggregate+=decoded.byteLength;
    }catch(e){
      skipped.push({name,reason:e.message||'invalid audio archive entry'});
    }
  }
  return {files,skipped};
}
/**
 * Pure assignment policy. Never silently replace already loaded sounds, since
 * multiple cues may reuse them. Match existing unloaded placeholders by name.
 */
export function planAudioLibraryBatch(files,assets,isLoaded,{independentFiles=false}={}){
  if(!Array.isArray(files)||!Array.isArray(assets)||typeof isLoaded!=='function')
    throw new TypeError('Invalid audio batch');
  const accepted=[],skipped=[],seen=new Set();
  for(const file of files){
    const name=file?.name??'';
    if(typeof name!=='string'||name.length>200||!AUDIO_EXT.test(name)||
       /[/\\\x00-\x1F\x7F]/.test(name) ||
       !Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_AUDIO_FILE_BYTES){
      skipped.push({name:String(name).slice(0,200),reason:'unsupported format, name or size'});
      continue;
    }
    const key=name.toLocaleLowerCase();
    if(!independentFiles&&seen.has(key)){skipped.push({name,reason:'duplicate in selection'});continue}
    seen.add(key);
    // Cue drops keep each original independent, even when names coincide.
    const matching=independentFiles?[]:assets.filter(a=>a.name.toLocaleLowerCase()===key);
    if(matching.length>1){skipped.push({name,reason:'ambiguous existing library references'});continue}
    if(matching.length===1&&isLoaded(matching[0].id)){
      skipped.push({name,reason:'already loaded; no overwrite'});continue;
    }
    if(accepted.length>=MAX_AUDIO_BATCH_FILES){
      skipped.push({name,reason:'maximum 100 audio files per batch'});continue;
    }
    accepted.push({file,assetId:matching[0]?.id??null,
      kind:matching.length?'restore':'new'});
  }
  return {accepted,skipped};
}
