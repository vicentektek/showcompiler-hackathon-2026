/**
 * Archive sniffing independent of Windows extensions and file-dialog filters.
 * The ordinary strict ZIP parser remains the default for ZIP.
 * libarchive WASM is used only for RAR/7z, on the user's machine.
 */
import {
  extractAudioZip, MAX_AUDIO_ZIP_BYTES, MAX_AUDIO_BATCH_FILES,
  MAX_AUDIO_FILE_BYTES, MAX_BATCH_TOTAL_BYTES,
} from './audioBatchImport.mjs';

const fail=message=>new TypeError('Archivo comprimido: '+message);
const AUDIO=/\.(?:wav|mp3|ogg|m4a|aac|flac)$/i;
const MAGIC={
  zip:[[0x50,0x4b,0x03,0x04],[0x50,0x4b,0x05,0x06],[0x50,0x4b,0x07,0x08]],
  rar:[[0x52,0x61,0x72,0x21,0x1a,0x07,0x00],[0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00]],
  '7z':[[0x37,0x7a,0xbc,0xaf,0x27,0x1c]],
};
export function archiveKind(bytes){
  if(!(bytes instanceof Uint8Array))throw new TypeError('Expected archive bytes');
  for(const [kind,signatures] of Object.entries(MAGIC)){
    if(signatures.some(signature=>signature.every((value,i)=>bytes[i]===value)))return kind;
  }
  return null;
}
export function describeArchiveIssue(file,bytes){
  const name=file?.name??'';
  if(!/\.(?:zip|rar|7z)$/i.test(name)){
    return fail('selecciona un archivo .zip, .rar o .7z. Seleccionado: '+name);
  }
  if(bytes.length>MAX_AUDIO_ZIP_BYTES)
    return fail('el archivo supera el límite de 64 MB ('+
      (bytes.length/1e6).toFixed(1)+' MB). Divide el paquete en varios.');
  const kind=archiveKind(bytes);
  if(kind)return null;
  return fail('el archivo '+name+' no tiene una cabecera válida ZIP, RAR o 7z. '+
    'Podría estar incompleto, usar otro formato o formar parte de un archivo dividido.');
}
function safePath(path){
  if(typeof path!=='string'||!path||path.startsWith('/')||
      /^[a-z]:/i.test(path)||path.includes('\\')||
      /[\x00-\x1f\x7f]/.test(path) ||
      path.split('/').some(segment=>segment===''||segment==='.'||segment==='..'))
    throw fail('ruta insegura detectada dentro del archivo');
  return path;
}
function skipHidden(name){
  return name.split('/').some(part=>part.startsWith('.')||part==='__MACOSX');
}
/**
 * Adapter can receive an explicit opener for isolated unit tests; otherwise
 * imports the installed local libarchive.js bundle, never a remote CDN.
 */
export async function extractAudioArchive(file,{openArchive}={}){
  if(!file||typeof file.arrayBuffer!=='function'||
      !Number.isFinite(file.size)||file.size<7)
    throw fail('archivo vacío o inaccesible');
  if(file.size>MAX_AUDIO_ZIP_BYTES)
    throw fail('el archivo pesa '+(file.size/1e6).toFixed(1)+
      ' MB; el máximo provisional es 64 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const problem=describeArchiveIssue(file,bytes);
  if(problem)throw problem;
  const kind=archiveKind(bytes);
  if(kind==='zip'){
    try{return {...await extractAudioZip(bytes),format:kind}}
    catch(error){throw fail('ZIP no legible: '+error.message+
      '. Comprueba que no esté dañado o cifrado.')}
  }
  const name=file.name;
  if(/(?:\.part\d+\.rar|\.r\d{2}|\.7z\.0+\d+)$/i.test(name))
    throw fail('los archivos divididos en varios volúmenes no están admitidos');
  const open=openArchive??(async input=>{
    let Archive;
    try{({Archive}=await import('/vendor/libarchive/libarchive.js'))}
    catch{throw fail('no se encuentra el motor local RAR/7z. Ejecuta npm install en el proyecto')}
    Archive.init({workerUrl:'/vendor/libarchive/worker-bundle.js'});
    return Archive.open(input);
  });
  let archive;
  const files=[],skipped=[],seen=new Set();
  try{
    archive=await open(file);
    if(!archive || typeof archive.getFilesArray!=='function')
      throw fail('el motor RAR/7z no ha podido abrir el archivo');
    if(await archive.hasEncryptedData?.())
      throw fail('el archivo está protegido con contraseña: todavía no se admiten archivos cifrados');
    const listed=await archive.getFilesArray();
    if(!Array.isArray(listed)||listed.length>140)
      throw fail('el archivo contiene demasiadas entradas (máximo 140)');
    const records=[];
    let total=0;
    for(const item of listed){
      const path=safePath((item.path??'')+((item.file?.name && !String(item.path??'').endsWith(item.file.name))?item.file.name:''));
      const leaf=path.split('/').at(-1);
      if(skipHidden(path)||!AUDIO.test(leaf)){
        skipped.push({name:path,reason:'no es un archivo de audio'});continue;
      }
      if(leaf.length>200){
        skipped.push({name:path,reason:'nombre demasiado largo'});continue;
      }
      const nameKey=leaf.toLocaleLowerCase();
      if(seen.has(nameKey)){
        skipped.push({name:path,reason:'nombre de audio repetido en distintas carpetas'});continue;
      }
      seen.add(nameKey);
      if(files.length+records.length>=MAX_AUDIO_BATCH_FILES){
        skipped.push({name:path,reason:'máximo 100 audios por lote'});continue;
      }
      const size=item.file?.size;
      if(!Number.isSafeInteger(size)||size<1||size>MAX_AUDIO_FILE_BYTES||
          total+size>MAX_BATCH_TOTAL_BYTES){
        skipped.push({name:path,reason:'supera el límite de 20 MB por audio o 100 MB por lote'});continue;
      }
      if(typeof item.file?.extract!=='function')
        throw fail('la entrada no tiene un extractor válido');
      total+=size;
      records.push({file:item.file,path,name:leaf,size});
    }
    for(const entry of records){
      try{
        const extracted=await entry.file.extract();
        if(!extracted || extracted.size!==entry.size ||
            typeof extracted.arrayBuffer!=='function')
          throw fail('los bytes extraídos no coinciden con el tamaño anunciado');
        files.push(new File([await extracted.arrayBuffer()],entry.name,
          {type:'application/octet-stream'}));
      }catch(e){
        skipped.push({name:entry.path,reason:e.message||'falló la extracción'});
      }
    }
    return {files,skipped,format:kind};
  }catch(error){
    if(String(error?.message??'').startsWith('Archivo comprimido:'))throw error;
    throw fail(name+' no se pudo abrir como '+kind.toUpperCase()+': '+
      (error?.message??String(error))+
      '. Comprueba si está cifrado, dividido o dañado.');
  }finally{try{await archive?.close?.()}catch{}}
}
