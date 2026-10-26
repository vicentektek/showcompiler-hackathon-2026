/**
 * Local browser audio transport (hackathon 2026).
 * Plays operator-approved DRAFT cues only after an explicit GO.
 * No AI call, external I/O, server audio upload, or professional audio guarantee.
 */
export class BrowserAudioEngine {
  constructor({ contextFactory = () => new AudioContext(), onStateChange = () => {} } = {}) {
    if (typeof contextFactory !== 'function' || typeof onStateChange !== 'function') {
      throw new TypeError('Invalid audio engine configuration');
    }
    this.contextFactory = contextFactory;
    this.onStateChange = onStateChange;
    this.context = null;
    this.buffers = new Map();
    this.playing = new Map();
    this.pending = new Set();
    this.transportEpoch = 0;
    this.assetEpoch = 0;
  }

  getContext() {
    if (!this.context) this.context = this.contextFactory();
    return this.context;
  }

  notify() {
    try { this.onStateChange(); } catch { /* Never let a UI error defeat STOP. */ }
  }

  hasAsset(assetId) { return this.buffers.has(assetId); }
  isPlaying(cueId) { return this.playing.has(cueId) || this.pending.has(cueId); }
  isStopping(cueId) { return this.playing.get(cueId)?.stopping === true; }
  activeCueCount() { return this.playing.size; }

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
    if (this.playing.size || this.pending.size) this.stopAll();
    this.buffers.set(assetId, decoded);
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
    if (this.isPlaying(cue.id)) throw new Error('Este cue ya está reproduciéndose.');
    this.pending.add(cue.id);
    const epoch = this.transportEpoch;
    this.notify();
    let voices = [];
    try {
      const ctx = this.getContext();
      if (typeof ctx.resume === 'function') await ctx.resume();
      if (epoch !== this.transportEpoch) throw new Error('GO cancelado por PARAR TODO.');
      if (ctx.state === 'suspended') throw new Error('El navegador ha bloqueado el audio.');
      const startAt = ctx.currentTime + 0.02;
      voices = cue.actions.map(action => {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = this.buffers.get(action.assetId);
        gain.gain.value = 0.5; // -6 dB initial gain for safer preview.
        source.connect(gain);
        gain.connect(ctx.destination);
        return { source, gain };
      });
      const run = { voices: new Set(voices), stopping: false };
      this.playing.set(cue.id, run);
      for (const voice of voices) {
        voice.source.onended = () => {
          voice.source.disconnect();
          voice.gain.disconnect();
          run.voices.delete(voice);
          if (run.voices.size === 0 && this.playing.get(cue.id) === run) {
            this.playing.delete(cue.id);
          }
          this.notify();
        };
      }
      for (const voice of voices) voice.source.start(startAt);
      this.notify();
      return true;
    } catch (error) {
      for (const voice of voices) {
        try { voice.source.stop(); } catch {}
        try { voice.source.disconnect(); } catch {}
        try { voice.gain.disconnect(); } catch {}
      }
      this.playing.delete(cue?.id);
      this.notify();
      throw error;
    } finally {
      this.pending.delete(cue?.id);
      this.notify();
    }
  }

  /** Stop one cue immediately or fade out; this does not modify stored cue actions. */
  stopCue(cueId, fadeMs = 0) {
    const run = this.playing.get(cueId);
    if (!run) return false;
    if (!Number.isFinite(fadeMs) || fadeMs < 0 || fadeMs > 10_000) {
      throw new RangeError('Fundido inválido (0–10 segundos).');
    }
    const now = this.getContext().currentTime;
    run.stopping = true;
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
    this.transportEpoch += 1;
    const now = this.context?.currentTime ?? 0;
    for (const run of this.playing.values()) {
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
    this.notify();
  }
}
