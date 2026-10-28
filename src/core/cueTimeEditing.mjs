/**
 * Cue-only timeline editing. Internal transport values remain integer ms.
 * Numeric timecode is human-facing; no source files are changed.
 */
export function formatCueTime(ms){
  if(!Number.isSafeInteger(ms)||ms<0)throw new RangeError('Invalid cue time');
  const min=Math.floor(ms/60000);
  const sec=Math.floor(ms/1000)%60;
  const millis=ms%1000;
  return String(min).padStart(2,'0')+':'+String(sec).padStart(2,'0')+'.'+
    String(millis).padStart(3,'0');
}
/** Accept 12.3, 01:12.300, 1:02:03.250 (comma or period decimal). */
export function parseCueTime(text){
  if(typeof text!=='string')throw new TypeError('Timecode must be text');
  const val=text.trim().replace(',','.');
  const parts=val.split(':');
  if(!parts.length||parts.length>3||!parts.every(p=>/^\d+(?:\.\d{1,3})?$/.test(p)))
    throw new RangeError('Expected seconds or MM:SS.mmm');
  // Only final field can contain fractions; seconds/minutes in clock notation <60.
  if(parts.slice(0,-1).some(p=>p.includes('.')))throw new RangeError('Invalid clock field');
  const last=parts.at(-1);
  if(parts.length>1 && Number(last)>=60)throw new RangeError('Seconds must be under 60');
  if(parts.length===3 && Number(parts[1])>=60)throw new RangeError('Minutes must be under 60');
  let ms=Math.round(Number(last)*1000);
  if(parts.length>=2)ms+=Number(parts[parts.length-2])*60000;
  if(parts.length===3)ms+=Number(parts[0])*3600000;
  if(!Number.isSafeInteger(ms)||ms>600000)throw new RangeError('Timecode beyond 10 minutes');
  return ms;
}
export function clampCueFade({handle,positionMs,inMs,outMs,rate=1,otherFadeMs=0,loop=false}){
  if(handle!=='fadeIn'&&handle!=='fadeOut')throw new RangeError('Unknown fade handle');
  if(!Number.isFinite(positionMs)||!Number.isFinite(inMs)||!Number.isFinite(outMs)||
      !Number.isFinite(rate)||rate<.5||rate>2||inMs>=outMs)
    throw new RangeError('Invalid cue clip');
  if(handle==='fadeOut'&&loop)return 0;
  const total=(outMs-inMs)/rate;
  const available=Math.min(10000,Math.max(0,total-Math.max(0,otherFadeMs)));
  const asked=handle==='fadeIn'
    ?(positionMs-inMs)/rate:(outMs-positionMs)/rate;
  return Math.max(0,Math.min(Math.round(asked/10)*10,Math.floor(available/10)*10));
}
