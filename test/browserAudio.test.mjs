import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';

function fixture(options = {}) {
  const log = [];
  const sources = [];
  const gains = [];
  let unblockResume = null;
  const buffer = { duration: 3, numberOfChannels: 2 };
  const context = {
    currentTime: 12,
    state: 'running',
    destination: { id: 'output' },
    decodeAudioData: async raw => { log.push(['decode', raw.byteLength]); return options.buffer ?? buffer; },
    resume: async () => { log.push(['resume']); if (options.deferredResume) await new Promise(resolve => { unblockResume = resolve; }); },
    createGain: () => {
      const gain = {
        gain: { value: 1,
          cancelScheduledValues: t => log.push(['cancel', t]),
          setValueAtTime: (v, t) => { gain.gain.value = v; log.push(['gain', v, t]); },
          linearRampToValueAtTime: (v, t) => log.push(['fade', v, t]),
        },
        connect: () => {}, disconnect: () => {},
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source = {
        buffer: null, onended: null,
        connect: () => {}, disconnect: () => {},
        start: t => { source.started = t; log.push(['start', t]); },
        stop: t => { source.stopped = t; log.push(['stop', t]); },
        end: () => source.onended?.(),
      };
      sources.push(source);
      return source;
    },
  };
  const engine = new BrowserAudioEngine({ contextFactory: () => context, onStateChange: options.onStateChange ?? (() => {}) });
  const cue = (id='cue-1', assetId='audio-1') => ({ id, status:'DRAFT', actions:[{type:'PLAY',assetId}] });
  const file = { name:'music.wav', size: 1024, arrayBuffer: async () => new ArrayBuffer(1024) };
  return { engine, log, sources, gains, context, cue, file, resumeNow: () => unblockResume?.() };
}

test('loads and decodes actual file bytes using the browser audio adapter', async () => {
  const x = fixture();
  const detail = await x.engine.loadFile(x.file,'audio-1');
  assert.deepEqual(detail,{ durationSeconds:3,channels:2 });
  assert.equal(x.engine.hasAsset('audio-1'),true);
  assert.deepEqual(x.log[0],['decode',1024]);
});

test('manual GO starts an approved draft cue at reduced output level', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  assert.equal(x.sources.length,1);
  assert.equal(x.sources[0].buffer.duration,3);
  assert.equal(x.sources[0].started,12.02);
  assert.equal(x.gains[0].gain.value,0.5);
  assert.equal(x.engine.activeCueCount(),1);
});

test('GO rejects missing audio, unapproved or unsupported actions', async () => {
  const x=fixture();
  await assert.rejects(x.engine.go(x.cue()),/sin todos sus audios/);
  await x.engine.loadFile(x.file,'audio-1');
  await assert.rejects(x.engine.go({...x.cue(),status:'PENDING'}));
  await assert.rejects(x.engine.go({...x.cue(),actions:[{type:'EXECUTE_SHELL'}]}));
  assert.equal(x.sources.length,0);
});

test('a running cue cannot start twice, but may run after natural end', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  await assert.rejects(x.engine.go(x.cue()),/ya está/);
  x.sources[0].end();
  assert.equal(x.engine.activeCueCount(),0);
  await x.engine.go(x.cue());
  assert.equal(x.sources.length,2);
});

test('STOP cuts audio and frees the cue for a new GO', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  assert.equal(x.engine.stopCue('cue-1'),true);
  assert.equal(x.engine.activeCueCount(),0);
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.sources[0].stopped,12);
  assert.equal(x.engine.stopCue('missing'),false);
});

test('fade schedules a ramp and eventually stops the source', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  assert.equal(x.engine.stopCue('cue-1',1500),true);
  assert.equal(x.engine.isStopping('cue-1'),true);
  assert.ok(x.log.some(event => event[0]==='fade' && event[1]===0 && event[2]===13.5));
  assert.equal(x.sources[0].stopped,13.52);
  x.sources[0].end();
  assert.equal(x.engine.isPlaying('cue-1'),false);
  assert.equal(x.engine.stopCue('cue-1',-1),false); // Already finished.
});

test('invalid fade is rejected while cue remains active', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  assert.throws(()=>x.engine.stopCue('cue-1',Infinity),RangeError);
  assert.equal(x.engine.isPlaying('cue-1'),true);
});

test('PARAR TODO silences multiple cues, including one already fading', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue('cue-1'));
  await x.engine.go(x.cue('cue-2'));
  x.engine.stopCue('cue-1',1000);
  x.engine.stopAll();
  assert.equal(x.engine.activeCueCount(),0);
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.gains[1].gain.value,0);
});

test('PARAR TODO invalidates an asynchronous GO waiting on context resume', async () => {
  const x=fixture({deferredResume:true});
  await x.engine.loadFile(x.file,'audio-1');
  const p=x.engine.go(x.cue());
  await Promise.resolve();
  x.engine.stopAll();
  x.resumeNow();
  await assert.rejects(p,/cancelado/);
  assert.equal(x.sources.length,0);
});

test('reset clears decoded assets and stops current show', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  x.engine.reset();
  assert.equal(x.engine.hasAsset('audio-1'),false);
  assert.equal(x.engine.activeCueCount(),0);
});

test('reset cancels a pending file decode before it can mutate the new show', async () => {
  let resolveFile;
  const x=fixture();
  const delayed={name:'music.wav',size:10,arrayBuffer:()=>new Promise(resolve=>{resolveFile=resolve;})};
  const loading=x.engine.loadFile(delayed,'audio-1');
  x.engine.reset();
  resolveFile(new ArrayBuffer(10));
  await assert.rejects(loading,/canceló/);
  assert.equal(x.engine.hasAsset('audio-1'),false);
});

test('rejects unsupported, overly large, long and multichannel input files', async () => {
  const x=fixture();
  await assert.rejects(x.engine.loadFile({...x.file,name:'wrong.txt'},'audio-1'));
  await assert.rejects(x.engine.loadFile({...x.file,size:21_000_000},'audio-1'));
  const big=fixture({buffer:{duration:601,numberOfChannels:2}});
  await assert.rejects(big.engine.loadFile(big.file,'audio-1'),/10 minutos/);
  const multichannel=fixture({buffer:{duration:10,numberOfChannels:6}});
  await assert.rejects(multichannel.engine.loadFile(multichannel.file,'audio-1'),/mono\/estéreo/);
});

test('UI callback errors do not block STOP or PANIC', async () => {
  const x=fixture({onStateChange:()=>{throw new Error('Render failed');}});
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  assert.doesNotThrow(()=>x.engine.stopAll());
  assert.equal(x.engine.activeCueCount(),0);
});

test('audition plays a decoded local asset at reduced output without executing a cue', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.auditionAsset('audio-1');
  assert.equal(x.engine.isAuditioning(),true);
  assert.equal(x.engine.activeCueCount(),0);
  assert.equal(x.sources.length,1);
  assert.equal(x.gains[0].gain.value,0.25);
  await assert.rejects(x.engine.go(x.cue()),/preescucha/);
  assert.equal(x.engine.stopAudition(),true);
  assert.equal(x.engine.isAuditioning(),false);
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.sources[0].stopped,12);
  assert.equal(x.engine.stopAudition(),false);
  await x.engine.go(x.cue());
  assert.equal(x.engine.activeCueCount(),1);
});
test('audition rejects missing assets, concurrent playback and double audition', async () => {
  const x=fixture();
  await assert.rejects(x.engine.auditionAsset('missing'),/no cargado/);
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.go(x.cue());
  await assert.rejects(x.engine.auditionAsset('audio-1'),/Detén/);
  x.engine.stopCue('cue-1');
  await x.engine.auditionAsset('audio-1');
  await assert.rejects(x.engine.auditionAsset('audio-1'),/Detén/);
  await assert.rejects(x.engine.loadFile(x.file,'audio-2'),/preescucha/);
});
test('STOP ALL silences a running audition and cancels a pending one', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  await x.engine.auditionAsset('audio-1');
  x.engine.stopAll();
  assert.equal(x.engine.isAuditioning(),false);
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.sources[0].stopped,12);
  const delayed=fixture({deferredResume:true});
  await delayed.engine.loadFile(delayed.file,'audio-1');
  const promise=delayed.engine.auditionAsset('audio-1');
  await Promise.resolve();
  assert.equal(delayed.engine.isAuditioning(),true);
  delayed.engine.stopAll();
  delayed.resumeNow();
  await assert.rejects(promise,/cancelada/);
  assert.equal(delayed.engine.isAuditioning(),false);
  assert.equal(delayed.sources.length,0);
});

test('STOP cancels GO while AudioContext resume is pending and does not emit sound', async () => {
  const x=fixture({deferredResume:true});
  await x.engine.loadFile(x.file,'audio-1');
  const first=x.engine.go(x.cue());
  await Promise.resolve();
  assert.equal(x.engine.isPlaying('cue-1'),true);
  assert.equal(x.engine.stopCue('cue-1'),true);
  assert.equal(x.engine.isStopping('cue-1'),true);
  await assert.rejects(x.engine.go(x.cue()),/ya está reproduciéndose/);
  x.resumeNow();
  await assert.rejects(first,/cancelado por STOP/);
  assert.equal(x.engine.activeCueCount(),0);
  assert.equal(x.engine.isPlaying('cue-1'),false);
  assert.equal(x.sources.length,0);
  const second=x.engine.go(x.cue());
  await Promise.resolve();
  x.resumeNow();
  await second;
  assert.equal(x.sources.length,1);
});

test('STOP of a pending cue does not inadvertently cancel another cue GO', async () => {
  const x=fixture();
  await x.engine.loadFile(x.file,'audio-1');
  let unblock;
  x.context.resume = () => new Promise(resolve => { unblock ??= resolve; });
  const first=x.engine.go(x.cue('cue-1'));
  const second=x.engine.go(x.cue('cue-2'));
  await Promise.resolve();
  assert.equal(x.engine.stopCue('cue-1',1500),true);
  unblock();
  await assert.rejects(first,/cancelado/);
  await second;
  assert.equal(x.sources.length,1);
  assert.equal(x.engine.isPlaying('cue-1'),false);
  assert.equal(x.engine.isPlaying('cue-2'),true);
  x.engine.stopAll();
});

test('invalid fade duration never silently cancels pending GO', async () => {
  const x=fixture({deferredResume:true});
  await x.engine.loadFile(x.file,'audio-1');
  const pending=x.engine.go(x.cue());
  await Promise.resolve();
  assert.throws(()=>x.engine.stopCue('cue-1',12000),RangeError);
  assert.equal(x.engine.isStopping('cue-1'),false);
  x.engine.stopAll();
  x.resumeNow();
  await assert.rejects(pending,/cancelado/);
});
