/**
 * Local browser audio transport (hackathon 2026).
 * Plays operator-approved DRAFT cues only after an explicit GO.
 * No AI call, external I/O, server audio upload, or professional audio guarantee.
 */
import { normalizeCuePlayback } from './cuePlayback.mjs';
import { summarizeWaveform } from './audioWaveform.mjs';

export class BrowserAudioEngine {
  constructor({ contextFactory = () => new AudioContext(), onStateChange = () => {}, onCueNaturalEnd = () => {} } = {}) {
    if (typeof contextFactory !== 'function' || typeof onStateChange !== 'function' || typeof onCueNaturalEnd !== 'function') {
      throw new TypeError('Invalid audio engine configuration');
    }
    this.contextFactory = contextFactory;
    this.onStateChange = onStateChange;
    this.onCueNaturalEnd = onCueNaturalEnd;
    this.context = null;
    this.buffers = new Map();
    this.waveforms = new Map();
    this.playing = new Map();
    this.pending = new Set();
    this.cancelledPending = new Set();
    this.auditionVoice = null;
    this.auditionPending = false;
    this.transportEpoch = 0;
    this.assetEpoch = 0;
  }

  getContext() {
    if (!this.context) this.context = this.contextFactory();
    return this.context;
  }
  /** Unlock output from the operator's explicit rehearsal ARM gesture. No sound. */
  async armAudioOutput(){
    const ctx=this.getContext();
    if(typeof ctx.resume==='function')await ctx.resume();
    if(ctx.state==='suspended')throw new Error('Browser audio output is suspended');
    return true;
  }

  notify() {
    try { this.onStateChange(); } catch { /* Never let a UI error defeat STOP. */ }
  }

  hasAsset(assetId) { return this.buffers.has(assetId); }

  /** Read-only amplitude envelope for the waveform editor, never raw PCM. */
  getWaveform(assetId) {
    const buffer = this.buffers.get(assetId);
    if (!buffer) return null;
    if (!this.waveforms.has(assetId)) {
      this.waveforms.set(assetId, summarizeWaveform(buffer));
    }
    return this.waveforms.get(assetId);
  }
  isPlaying(cueId) { return this.playing.has(cueId) || this.pending.has(cueId); }
  isStopping(cueId) { return this.playing.get(cueId)?.stopping === true || this.cancelledPending.has(cueId); }
  activeCueCount() { return this.playing.size; }

  /** Truthful read-only live voices snapshot; all clock values from AudioContext.
   * No synthetic meters, seeking, or audio hardware claims.
   */
  getActiveCues() {
    const now = this.context?.currentTime ?? 0;
    const result = [];
    for (const [cueId, run] of this.playing) {
      const begunAt = run.startedAt ?? now;
      const elapsedSeconds = Math.max(0, now - begunAt);
      const endsAt = run.stopping && Number.isFinite(run.stopEndsAt)
        ? run.stopEndsAt : run.endsAt;
      const durationSeconds = Number.isFinite(endsAt) && !run.stopping
        ? Math.max(0, endsAt - begunAt) : run.durationSeconds;
      const remainingSeconds = Number.isFinite(endsAt) ? Math.max(0, endsAt - now) : null;
      const progress = durationSeconds > 0 && Number.isFinite(durationSeconds)
        ? Math.max(0, Math.min(1, elapsedSeconds / durationSeconds)) : null;
      result.push(Object.freeze({
        cueId, stopping: run.stopping === true, elapsedSeconds,
        remainingSeconds, durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        progress,
      }));
    }
    return Object.freeze(result);
  }
  isAuditioning() { return this.auditionVoice !== null || this.auditionPending; }

  /** Audition is never a show GO. These voices cannot change the operator playhead. */
  createPreviewVoice(ctx, track, clockStart) {
    const playback = track.playback;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = this.buffers.get(track.assetId);
    const startAt = clockStart; // Preview intentionally skips waits.
    const offsetSeconds = playback.startAtMs / 1000;
    const targetGain = 0.25 * 10 ** (playback.gainDb / 20);
    if (playback.playbackRate !== 1) {
      if (!source.playbackRate) throw new Error('Control de velocidad no disponible.');
      source.playbackRate.value = playback.playbackRate;
    }
    source.loop = playback.loop || playback.repeatCount > 1;
    const clipEndSeconds = playback.endAtMs === null
      ? source.buffer.duration : playback.endAtMs / 1000;
    const clipSeconds = clipEndSeconds - offsetSeconds;
    if (source.loop) {
      source.loopStart = offsetSeconds;
      source.loopEnd = clipEndSeconds;
    }
    const duration = clipSeconds * playback.repeatCount / playback.playbackRate;
    const fadeIn = Math.min(playback.fadeInMs / 1000, duration);
    const fadeOut = playback.loop ? 0 : Math.min(playback.fadeOutMs / 1000, Math.max(0, duration - fadeIn));
    gain.gain.value = fadeIn ? 0 : targetGain;
    if (fadeIn) {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(targetGain, startAt + fadeIn);
    }
    if (fadeOut) {
      gain.gain.setValueAtTime(targetGain, startAt + duration - fadeOut);
      gain.gain.linearRampToValueAtTime(0, startAt + duration);
    }
    const panner = playback.pan === 0 ? null : ctx.createStereoPanner();
    if (panner) panner.pan.value = playback.pan;
    source.connect(gain);
    if (panner) { gain.connect(panner); panner.connect(ctx.destination); }
    else gain.connect(ctx.destination);
    return {source,gain,panner,duration,repeatCount:playback.repeatCount,
      loop:playback.loop,startAt,offsetSeconds,
      startDuration:source.loop || playback.endAtMs === null ? null : clipSeconds};

  }

  /** Preview a complete cue or one stem, including UNSAVED editor settings.
   * The default physical output is shared with GO, never a private monitor bus.
   */
  async previewCue(cue, { trackId = null, fromMs = null } = {}) {
    if (!cue || cue.status !== 'DRAFT' || typeof cue.id !== 'string' ||
        !Array.isArray(cue.actions) || !cue.actions.length ||
        cue.actions.some(action => action?.type !== 'PLAY')) {
      throw new TypeError('Preview requires a playable DRAFT cue');
    }
    if (this.playing.size || this.pending.size || this.isAuditioning()) {
      throw new Error('Detén el transporte o la escucha antes de preescuchar.');
    }
    let tracks = [
      ...cue.actions.map((action,i) => ({ id:i===0?'primary':'action-'+i,
        assetId:action.assetId, playback:normalizeCuePlayback(cue.playback) })),
      ...(cue.audioTracks??[]).map(track => ({ id:track.id, assetId:track.assetId,
        playback:normalizeCuePlayback(track.playback) })),
    ];
    if (tracks.length > 12 || tracks.some(t=>!this.hasAsset(t.assetId))) {
      throw new Error('Cue inválido o sin todos sus audios cargados.');
    }
    if (trackId !== null) {
      if (typeof trackId !== 'string' || !tracks.some(track=>track.id===trackId)) {
        throw new RangeError('Preview track missing');
      }
      tracks = tracks.filter(track=>track.id===trackId);
    }
    if (fromMs !== null) {
      if (trackId === null || !Number.isSafeInteger(fromMs)) {
        throw new RangeError('Preview from cursor requires one track');
      }
      tracks = tracks.map(track=>{
        const endMs=track.playback.endAtMs??Math.floor(this.buffers.get(track.assetId).duration*1000);
        if (fromMs < track.playback.startAtMs || fromMs >= endMs) {
          throw new RangeError('Cursor must be inside current IN/OUT region');
        }
        return {...track,playback:normalizeCuePlayback({
          ...track.playback,startAtMs:fromMs,loop:false,repeatCount:1,
        })};
      });
    }
    for (const track of tracks) {
      const lengthMs=this.buffers.get(track.assetId).duration*1000;
      if (track.playback.startAtMs>=lengthMs ||
          (track.playback.endAtMs!==null &&
            (track.playback.endAtMs>lengthMs || track.playback.endAtMs<=track.playback.startAtMs))) {
        throw new RangeError('Preview IN/OUT outside audio');
      }
    }
    const epoch=this.transportEpoch;
    this.auditionPending=true;
    this.notify();
    const voices=[];
    let run=null;
    try {
      const ctx=this.getContext();
      if (typeof ctx.resume==='function') await ctx.resume();
      if (epoch!==this.transportEpoch) throw new Error('Preescucha cancelada por PARAR TODO.');
      if (ctx.state==='suspended') throw new Error('El navegador ha bloqueado el audio.');
      if (tracks.some(t=>t.playback.pan!==0) && typeof ctx.createStereoPanner!=='function') {
        throw new Error('Este navegador no admite panorama estéreo.');
      }
      const clockStart=ctx.currentTime+0.02;
      for (const track of tracks) voices.push(this.createPreviewVoice(ctx,track,clockStart));
      run={voices:new Set(voices),cueId:cue.id,trackId:trackId??(tracks.length===1?tracks[0].id:null),
        startedAt:clockStart,
        previewFromMs:tracks.length===1?tracks[0].playback.startAtMs:null,
        previewEndMs:tracks.length===1
          ? (tracks[0].playback.endAtMs??Math.round(this.buffers.get(tracks[0].assetId).duration*1000))
          : null,
        playbackRate:tracks.length===1?tracks[0].playback.playbackRate:1,
        repeating:tracks.length===1 ? (tracks[0].playback.loop || tracks[0].playback.repeatCount>1) : false,
        durationSeconds:tracks.some(track=>track.playback.loop)?null:Math.max(...voices.map(voice=>voice.duration))};
      this.auditionVoice=run;
      for (const voice of voices) {
        voice.source.onended=()=>{
          try{voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();}catch{}
          run.voices.delete(voice);
          if (!run.voices.size && this.auditionVoice===run) this.auditionVoice=null;
          this.notify();
        };
      }
      for (const voice of voices) {
        if (voice.startDuration===null) voice.source.start(voice.startAt,voice.offsetSeconds);
        else voice.source.start(voice.startAt,voice.offsetSeconds,voice.startDuration);
        if (!voice.loop && voice.repeatCount>1) voice.source.stop(voice.startAt+voice.duration);
      }
      this.notify();
      return true;
    } catch(error) {
      for (const voice of voices) {
        try{voice.gain.gain.value=0;voice.source.stop();}catch{}
        try{voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();}catch{}
      }
      if (this.auditionVoice===run) this.auditionVoice=null;
      throw error;
    } finally {
      this.auditionPending=false;
      this.notify();
    }
  }

  /** Read-only audition feedback; time is audio-context time, not setInterval time. */
  getPreviewStatus() {
    const run=this.auditionVoice;
    if (!run || !run.cueId) return null;
    const elapsedSeconds=Math.max(0,(this.context?.currentTime??run.startedAt)-run.startedAt);
    const length=run.previewEndMs-run.previewFromMs;
    const position=run.previewFromMs===null ? null : run.previewFromMs+
      (run.repeating ? (elapsedSeconds*1000*run.playbackRate)%length
        : Math.min(length,elapsedSeconds*1000*run.playbackRate));
    return Object.freeze({
      cueId:run.cueId,trackId:run.trackId,elapsedSeconds,
      durationSeconds:run.durationSeconds,positionMs:position,
    });
  }

  /** Same-output audition for checking a decoded local file before cue assignment.
   * This is NOT an independent monitor/headphone bus.
   */
  async auditionAsset(assetId) {
    if (!this.hasAsset(assetId)) throw new Error('Audio local no cargado.');
    if (this.playing.size || this.pending.size || this.isAuditioning()) {
      throw new Error('Detén el transporte o la escucha antes de preescuchar.');
    }
    this.auditionPending = true;
    const epoch = this.transportEpoch;
    this.notify();
    let voice = null;
    try {
      const ctx = this.getContext();
      if (typeof ctx.resume === 'function') await ctx.resume();
      if (epoch !== this.transportEpoch) throw new Error('Preescucha cancelada por PARAR TODO.');
      if (ctx.state === 'suspended') throw new Error('El navegador ha bloqueado el audio.');
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = this.buffers.get(assetId);
      gain.gain.value = 0.25;
      source.connect(gain);
      gain.connect(ctx.destination);
      voice = { source, gain, assetId };
      this.auditionVoice = voice;
      source.onended = () => {
        try { source.disconnect(); gain.disconnect(); } catch {}
        if (this.auditionVoice === voice) this.auditionVoice = null;
        this.notify();
      };
      source.start(ctx.currentTime + 0.02);
      this.notify();
      return true;
    } catch (error) {
      if (voice) {
        try { voice.gain.gain.value = 0; voice.source.stop(); } catch {}
        try { voice.source.disconnect(); voice.gain.disconnect(); } catch {}
        if (this.auditionVoice === voice) this.auditionVoice = null;
      }
      throw error;
    } finally {
      this.auditionPending = false;
      this.notify();
    }
  }

  /** Also cancels a pending asynchronous audition via epoch invalidation. */
  stopAudition() {
    if (!this.isAuditioning()) return false;
    this.transportEpoch += 1;
    const voice = this.auditionVoice;
    this.auditionVoice = null;
    if (voice) {
      const now = this.context?.currentTime ?? 0;
      const voices = voice.voices ? [...voice.voices] : [voice];
      for (const item of voices) {
        try {
          item.gain.gain.cancelScheduledValues(now);
          item.gain.gain.setValueAtTime(0, now);
        } catch { try { item.gain.gain.value = 0; } catch {} }
        try { item.source.stop(now); } catch {}
      }
    }
    this.notify();
    return true;
  }

  /** Decode locally. Only the decoded AudioBuffer is kept in volatile memory. */
  async loadFile(file, assetId) {
    if (!file || typeof file.arrayBuffer !== 'function' ||
        typeof file.name !== 'string' || !file.name ||
        !/\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(file.name) ||
        !Number.isFinite(file.size) || file.size <= 0 || file.size > 20_000_000) {
      throw new Error('Selecciona WAV/MP3/OGG/M4A/AAC/FLAC de hasta 20 MB.');
    }
    if (typeof assetId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(assetId)) {
      throw new Error('Referencia de audio no válida.');
    }
    const epoch = this.assetEpoch;
    const raw = await file.arrayBuffer();
    if (epoch !== this.assetEpoch) throw new Error('La carga se canceló al cambiar de proyecto.');
    const decoded = await this.getContext().decodeAudioData(raw);
    if (epoch !== this.assetEpoch) throw new Error('La carga se canceló al cambiar de proyecto.');
    if (!decoded || !Number.isFinite(decoded.duration) ||
        decoded.duration <= 0 || decoded.duration > 600 ||
        !Number.isInteger(decoded.numberOfChannels) ||
        decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2) {
      throw new Error('Solo se admiten audios mono/estéreo de hasta 10 minutos.');
    }
    if (this.isAuditioning()) throw new Error('Detén la preescucha antes de cargar nuevos audios.');
    if (this.playing.size || this.pending.size) this.stopAll();
    this.buffers.set(assetId, decoded);
    this.waveforms.delete(assetId);
    this.notify();
    return { durationSeconds: decoded.duration, channels: decoded.numberOfChannels };
  }

  /** No implicit audio or automatic follow-on cues; each GO is a user action. */
  async go(cue) {
    if (!cue || cue.status !== 'DRAFT' ||
        typeof cue.id !== 'string' || !cue.id ||
        !Array.isArray(cue.actions) || cue.actions.length < 1 ||
        cue.actions.length > 12 || cue.actions.some(action =>
          !action || action.type !== 'PLAY' ||
          typeof action.assetId !== 'string' || !this.hasAsset(action.assetId))) {
      throw new Error('Cue inválido o sin todos sus audios cargados.');
    }
    const playable = [
      ...cue.actions.map(action => ({assetId:action.assetId,playback:normalizeCuePlayback(cue.playback)})),
      ...(cue.audioTracks ?? []).map(track => ({assetId:track.assetId,playback:normalizeCuePlayback(track.playback)})),
    ];
    if (playable.length > 12 || playable.some(track => !this.hasAsset(track.assetId))) {
      throw new Error('Cue inválido o sin todos sus audios cargados.');
    }
    if (playable.some(track =>
      track.playback.startAtMs >= this.buffers.get(track.assetId).duration * 1000)) {
      throw new RangeError('El inicio del audio debe estar dentro de cada archivo.');
    }
    if (playable.some(track => track.playback.endAtMs !== null &&
      (track.playback.endAtMs > this.buffers.get(track.assetId).duration * 1000 ||
       track.playback.endAtMs <= track.playback.startAtMs))) {
      throw new RangeError('Los puntos IN/OUT deben estar dentro del archivo y OUT después de IN.');
    }
    if (this.isAuditioning()) throw new Error('Detén la preescucha antes de GO.');
    if (this.isPlaying(cue.id)) throw new Error('Este cue ya está reproduciéndose.');
    this.pending.add(cue.id);
    const epoch = this.transportEpoch;
    this.notify();
    let voices = [];
    try {
      const ctx = this.getContext();
      if (typeof ctx.resume === 'function') await ctx.resume();
      if (epoch !== this.transportEpoch || this.cancelledPending.has(cue.id)) {
        throw new Error('GO cancelado por STOP o PARAR TODO.');
      }
      if (ctx.state === 'suspended') throw new Error('El navegador ha bloqueado el audio.');
      const clockStart = ctx.currentTime + 0.02;
      if (playable.some(track => track.playback.pan !== 0) &&
          typeof ctx.createStereoPanner !== 'function') {
        throw new Error('Este navegador no admite panorama estéreo.');
      }
      voices = playable.map(track => {
        const playback = track.playback;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = this.buffers.get(track.assetId);
        const startAt = clockStart + playback.startDelayMs / 1000;
        const offsetSeconds = playback.startAtMs / 1000;
        const targetGain = 0.5 * 10 ** (playback.gainDb / 20);
        if (playback.playbackRate !== 1) {
          if (!source.playbackRate) throw new Error('Control de velocidad no disponible.');
          source.playbackRate.value = playback.playbackRate;
        }
        source.loop = playback.loop || playback.repeatCount > 1;
        const clipEndSeconds = playback.endAtMs === null
          ? source.buffer.duration : playback.endAtMs / 1000;
        const clipSeconds = clipEndSeconds - offsetSeconds;
        if (source.loop) {
          source.loopStart = offsetSeconds;
          source.loopEnd = clipEndSeconds;
        }
        const duration = clipSeconds * playback.repeatCount / playback.playbackRate;
        const fadeIn = Math.min(playback.fadeInMs / 1000, duration);
        const fadeOut = playback.loop ? 0 : Math.min(playback.fadeOutMs / 1000, Math.max(0, duration - fadeIn));
        gain.gain.value = fadeIn ? 0 : targetGain;
        if (fadeIn) {
          gain.gain.setValueAtTime(0, startAt);
          gain.gain.linearRampToValueAtTime(targetGain, startAt + fadeIn);
        }
        if (fadeOut) {
          gain.gain.setValueAtTime(targetGain, startAt + duration - fadeOut);
          gain.gain.linearRampToValueAtTime(0, startAt + duration);
        }
        const panner = playback.pan === 0 ? null : ctx.createStereoPanner();
        if (panner) panner.pan.value = playback.pan;
        source.connect(gain);
        if (panner) { gain.connect(panner); panner.connect(ctx.destination); }
        else gain.connect(ctx.destination);
        return {source,gain,panner,duration,repeatCount:playback.repeatCount,
          loop:playback.loop,startAt,offsetSeconds,
          startDuration:source.loop || playback.endAtMs === null ? null : clipSeconds};
      });
      const begunAt = Math.min(...voices.map(voice => voice.startAt));
      const runningForever = voices.some(voice => voice.loop);
      const endsAt = runningForever ? null
        : Math.max(...voices.map(voice => voice.startAt + voice.duration));
      const run = { voices: new Set(voices), stopping: false,
        startedAt: begunAt, endsAt,
        durationSeconds: endsAt === null ? null : endsAt - begunAt,
        stopEndsAt: null };
      this.playing.set(cue.id, run);
      for (const voice of voices) {
        voice.source.onended = () => {
          voice.source.disconnect();
          voice.gain.disconnect();
          voice.panner?.disconnect();
          run.voices.delete(voice);
          if (run.voices.size === 0 && this.playing.get(cue.id) === run) {
            this.playing.delete(cue.id);
            if (!run.stopping) {
              try { this.onCueNaturalEnd(cue.id); } catch { /* Never interrupt transport cleanup. */ }
            }
          }
          this.notify();
        };
      }
      for (const voice of voices) {
        if (voice.startDuration === null) voice.source.start(voice.startAt, voice.offsetSeconds);
        else voice.source.start(voice.startAt, voice.offsetSeconds, voice.startDuration);
        if (!voice.loop && voice.repeatCount > 1) {
          voice.source.stop(voice.startAt + voice.duration);
        }
      }
      this.notify();
      return true;
    } catch (error) {
      for (const voice of voices) {
        try { voice.source.stop(); } catch {}
        try { voice.source.disconnect(); } catch {}
        try { voice.gain.disconnect(); } catch {}
        try { voice.panner?.disconnect(); } catch {}
      }
      this.playing.delete(cue?.id);
      this.notify();
      throw error;
    } finally {
      this.pending.delete(cue?.id);
      this.cancelledPending.delete(cue?.id);
      this.notify();
    }
  }

  /** Stop one cue immediately or fade out; this does not modify stored cue actions. */
  stopCue(cueId, fadeMs = 0) {
    if (!Number.isFinite(fadeMs) || fadeMs < 0 || fadeMs > 10_000) {
      throw new RangeError('Fundido inválido (0–10 segundos).');
    }
    // A user can press STOP while context.resume() is still pending.
    // Invalidate this specific GO without canceling other queued cues.
    if (this.pending.has(cueId) && !this.playing.has(cueId)) {
      this.cancelledPending.add(cueId);
      this.notify();
      return true;
    }
    const run = this.playing.get(cueId);
    if (!run) return false;
    const now = this.getContext().currentTime;
    run.stopping = true;
    run.stopEndsAt = now + fadeMs / 1000;
    for (const voice of run.voices) {
      const param = voice.gain.gain;
      try {
        param.cancelScheduledValues(now);
        param.setValueAtTime(fadeMs ? param.value : 0, now);
        if (fadeMs) param.linearRampToValueAtTime(0, now + fadeMs / 1000);
        voice.source.stop(now + fadeMs / 1000 + (fadeMs ? 0.02 : 0));
      } catch {
        // A source may already have ended; never prevent other sources stopping.
        try { param.value = 0; } catch {}
      }
    }
    if (!fadeMs) this.playing.delete(cueId);
    this.notify();
    return true;
  }

  /** Emergency cut: silence every active gain and invalidate pending asynchronous GO. */
  stopAll() {
    this.stopAudition();
    this.transportEpoch += 1;
    this.cancelledPending.clear();
    const now = this.context?.currentTime ?? 0;
    for (const run of this.playing.values()) {
      run.stopping = true;
      for (const voice of run.voices) {
        try {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(0, now);
        } catch { try { voice.gain.gain.value = 0; } catch {} }
        try { voice.source.stop(now); } catch {}
      }
    }
    this.playing.clear();
    this.notify();
  }

  /** Call before switching shows or opening JSON; decoded audio is not persisted. */
  reset() {
    this.stopAll();
    this.assetEpoch += 1;
    this.buffers.clear();
    this.waveforms.clear();
    this.notify();
  }

  /** Release audio hardware resources when discarding a staged ZIP or show. */
  async dispose() {
    this.reset();
    const context = this.context;
    this.context = null;
    if (context && typeof context.close === 'function') await context.close();
  }
}
