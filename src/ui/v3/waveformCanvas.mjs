/**
 * Draws PCM-derived, strictly read-only mono/stereo waveform peaks.
 * Neither drawing, zoom nor panning changes project or transport state.
 */
export function waveformVisibleRange(durationMs, zoom=1, pan=0) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 ||
      !Number.isInteger(zoom) || zoom < 1 || zoom > 8 ||
      !Number.isFinite(pan) || pan < 0 || pan > 1) {
    throw new RangeError('Invalid waveform viewport');
  }
  const visible=durationMs/zoom;
  const start=(durationMs-visible)*pan;
  return {startMs:start,endMs:start+visible,durationMs:visible};
}
export function drawWaveform(canvas, peaks, {zoom=1,pan=0}={}) {
  if (!canvas || typeof canvas.getContext!=='function' || !peaks ||
      !Array.isArray(peaks.channels) || peaks.channels.length < 1 ||
      !Number.isSafeInteger(peaks.bucketCount) || peaks.bucketCount < 1) {
    throw new TypeError('Invalid waveform canvas or peaks');
  }
  const range=waveformVisibleRange(peaks.durationMs,zoom,pan);
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('Waveform drawing context unavailable');
  const w=canvas.width,h=canvas.height;
  if (!Number.isInteger(w) || w < 1 || !Number.isInteger(h) || h < 1) {
    throw new TypeError('Invalid waveform viewport canvas size');
  }
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#10222b';ctx.fillRect(0,0,w,h);
  const start=Math.floor((range.startMs/peaks.durationMs)*peaks.bucketCount);
  const end=Math.min(peaks.bucketCount,Math.max(start+1,
    Math.ceil((range.endMs/peaks.durationMs)*peaks.bucketCount)));
  const heightPerChannel=h/peaks.channels.length;
  for(const [channelIndex,channel] of peaks.channels.entries()){
    const mid=heightPerChannel*(channelIndex+.5);
    const amplitude=heightPerChannel*.42;
    ctx.fillStyle='#33545b';
    ctx.fillRect(0,Math.floor(mid),w,1);
    ctx.fillStyle=channelIndex===0?'#4ce0cc':'#7dbfe5';
    for(let x=0;x<w;x++){
      const bucket=start+Math.min(end-start-1,Math.floor((x/w)*(end-start)));
      const min=channel.min[bucket],max=channel.max[bucket];
      if(!Number.isFinite(min)||!Number.isFinite(max)||min>max) {
        throw new TypeError('Nonfinite or inverted PCM extrema');
      }
      const top=Math.max(0,mid-Math.max(-1,Math.min(1,max))*amplitude);
      const bottom=Math.min(h,mid-Math.max(-1,Math.min(1,min))*amplitude);
      ctx.fillRect(x,Math.min(top,bottom),1,Math.max(1,bottom-top));
    }
  }
  return range;
}
