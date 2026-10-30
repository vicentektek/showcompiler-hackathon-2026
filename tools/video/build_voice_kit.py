#!/usr/bin/env python3
"""Prepare RunQ demo voice assets without provider calls or secrets.

plan: export exact dialogue jobs and Azure SSML documents (no synthesis)
espeak: render clearly labelled robotic QA placeholders and assemble takes
import: normalize user-provided licensed TTS audio and assemble takes
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path
from xml.sax.saxutils import escape

RATE = 48000
VOICES = {
    'ELLA': ('en-GB-LibbyNeural', 'en-uk+f3', 143, 57, '0%'),
    'JAMES': ('en-GB-RyanNeural', 'en-uk+m3', 140, 44, '-3%'),
    'MAYA': ('en-GB-SoniaNeural', 'en-uk+f2', 132, 51, '-7%'),
    'DIRECTOR': ('en-GB-AlfieNeural', 'en-uk+m4', 150, 50, '0%'),
    'NARRATOR': ('en-GB-OliverNeural', 'en-uk+m2', 140, 47, '-6%'),
}
DIRECTOR = {'director_restart': "Let's start from the first moment again.",
            'director_skip': 'Skip ahead to the decision.'}
NEGATIVES = {'negative_clock': 'The clock is somewhere above us.',
             'negative_light': 'Perhaps the light will turn on.',
             'negative_go': 'go', 'negative_next': 'next', 'negative_stop': 'stop'}
COMMANDS = {'command_go': 'Go.', 'command_stop': 'Stop.',
            'command_next': 'Next.', 'command_stop_all': 'Stop all.',
            'command_cancel': 'Cancel.'}
TRIGGERS = {'L6': 'james_l06', 'L14': 'maya_l14', 'L23': 'ella_l23'}
TAKES = {
    '01_linear_en': ['james_l06', 'maya_l14', 'ella_l23'],
    '02_jump_en': ['james_l06', 'ella_l23'],
    '03_rewind_en': ['ella_l23', 'james_l06'],
    '04_repeat_en': ['maya_l14', 'maya_l14_repeat'],
    '05_disarmed_en': ['james_l06', 'maya_l14'],
    '06_negative_en': list(NEGATIVES),
    '07_director_en': ['director_restart', 'james_l06', 'director_skip', 'ella_l23'],
}

def jobs_from_sources(repo):
    script = (repo / 'fixtures/demo/runq-the-last-go-en.txt').read_text(encoding='utf-8').splitlines()
    if len(script) != 31:
        raise ValueError(f'Expected exactly 31 script lines; got {len(script)}')
    jobs = {}
    dialogue = []
    for i, line in enumerate(script, 1):
        match = re.fullmatch(r'(ELLA|JAMES|MAYA): (.+)', line)
        if not match:
            continue
        role, spoken = match.groups()
        ident = f'{role.lower()}_l{i:02d}'
        jobs[ident] = {'role': role, 'line': f'L{i}', 'text': spoken, 'kind': 'dialogue'}
        dialogue.append(ident)
    for line_no, expected in [(6, 'JAMES'), (14, 'MAYA'), (23, 'ELLA')]:
        ident = TRIGGERS[f'L{line_no}']
        if jobs.get(ident, {}).get('role') != expected:
            raise ValueError(f'Missing expected trigger at L{line_no}')
    jobs['maya_l14_repeat'] = dict(jobs['maya_l14'], kind='repeat')
    for id_, spoken in DIRECTOR.items():
        jobs[id_] = {'role': 'DIRECTOR', 'line': None, 'text': spoken, 'kind': 'director'}
    for id_, spoken in NEGATIVES.items():
        jobs[id_] = {'role': 'DIRECTOR', 'line': None, 'text': spoken, 'kind': 'negative'}
    for id_, spoken in COMMANDS.items():
        jobs[id_] = {'role': 'DIRECTOR', 'line': None, 'text': spoken, 'kind': 'command'}

    narration = (repo / 'docs/video/demo-pack/NARRATION_EN_V2.md').read_text(encoding='utf-8')
    section_pattern = re.compile(r'(?ms)^### (S\d\d) —[^\n]*\n\n(.*?)(?=^### |^## |\Z)')
    narrator_sections = {}
    for m in section_pattern.finditer(narration):
        scene, body = m.groups()
        if scene == 'S08':
            continue
        para = body.strip().split('\n\n', 1)[0].strip()
        if not para or para.startswith('**'):
            raise ValueError(f'Bad narrator text for {scene}')
        ident = f'narrator_{scene.lower()}'
        jobs[ident] = {'role': 'NARRATOR', 'line': scene, 'text': para, 'kind': 'narrator'}
        narrator_sections[scene] = ident
    if sorted(narrator_sections) != [f'S{i:02d}' for i in range(1, 12) if i != 8]:
        raise ValueError(f'Expected 10 narrator sections; got {sorted(narrator_sections)}')
    return jobs, dialogue, script

def azure_ssml(job):
    voice, _, _, _, rate = VOICES[job['role']]
    text = escape(job['text'])
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">\n'
            f'  <voice name="{voice}"><prosody rate="{rate}">{text}</prosody></voice>\n'
            '</speak>\n')

def command(cmd, *, input_text=None):
    return subprocess.run(cmd, input=input_text, text=input_text is not None,
                          capture_output=True, check=True)

def normalize_wav(source, dest):
    if not shutil.which('ffmpeg'):
        raise RuntimeError('ffmpeg is required to normalize voice clips')
    dest.parent.mkdir(parents=True, exist_ok=True)
    command(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
             '-ac', '1', '-ar', str(RATE), '-c:a', 'pcm_s16le', str(dest)])
    with wave.open(str(dest), 'rb') as w:
        if (w.getnchannels(), w.getframerate(), w.getsampwidth()) != (1, RATE, 2):
            raise ValueError(f'Invalid output format: {dest}')

def generate_espeak(job, dest):
    if not shutil.which('espeak'):
        raise RuntimeError('espeak is not installed; use --engine plan or import')
    _, voice, speed, pitch, _ = VOICES[job['role']]
    temp = dest.with_suffix('.raw-espeak.wav')
    try:
        command(['espeak', '-v', voice, '-s', str(speed), '-p', str(pitch), '-w', str(temp),
                 '--stdin'], input_text=job['text'])
        normalize_wav(temp, dest)
    finally:
        temp.unlink(missing_ok=True)

def read_pcm(path):
    with wave.open(str(path), 'rb') as f:
        if (f.getnchannels(), f.getframerate(), f.getsampwidth(), f.getcomptype()) != (1, RATE, 2, 'NONE'):
            raise ValueError(f'Must be mono 48kHz PCM16: {path}')
        return f.readframes(f.getnframes())

def silence(seconds):
    return bytes(round(seconds * RATE) * 2)

def assemble(ids, clips, destination, intro=1.15, gap=2.6, outro=1.1):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(silence(intro))
        for idx, name in enumerate(ids):
            if idx:
                w.writeframes(silence(4.0 if destination.stem == '04_repeat_en' else gap))
            w.writeframes(read_pcm(clips[name]))
        w.writeframes(silence(outro))

def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    ap.add_argument('--output', type=Path, default=Path('production/runq-voice-kit'))
    ap.add_argument('--engine', choices=['plan', 'espeak', 'import'], default='plan')
    ap.add_argument('--source-dir', type=Path, help='Licensed TTS clips named as voice jobs, WAV or MP3 (import)')
    args = ap.parse_args()
    if args.engine == 'import' and (not args.source_dir or not args.source_dir.is_dir()):
        ap.error('--engine import requires an existing --source-dir')
    jobs, dialogue, _ = jobs_from_sources(args.repo)
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    (out/'jobs.json').write_text(json.dumps({'status': 'PLAN_ONLY' if args.engine == 'plan' else 'RENDERED',
                'engine': args.engine, 'voices': {k:v[0] for k,v in VOICES.items()}, 'jobs': jobs,
                'triggers': TRIGGERS, 'takes': dict(TAKES, **{'08_full_scene_en': dialogue})},
                indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    for name, job in jobs.items():
        folder = out / 'ssml' / job['role'].lower()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f'{name}.ssml').write_text(azure_ssml(job), encoding='utf-8')

    if args.engine == 'plan':
        print(f'PLAN ONLY: {len(jobs)} exact scripts and Azure SSML files in {out}; NO audio generated or requested.')
        return
    clips = {}
    for name, job in jobs.items():
        target = out/'clips'/f'{name}.wav'
        if args.engine == 'espeak':
            generate_espeak(job, target)
        else:
            source = next((args.source_dir / (name+ext) for ext in ('.wav','.mp3','.flac','.m4a')
                          if (args.source_dir / (name+ext)).is_file()), None)
            if source is None:
                raise FileNotFoundError(f'Missing required licensed source clip: {name} (wav/mp3/flac/m4a)')
            normalize_wav(source, target)
        clips[name] = target
    for title, order in dict(TAKES, **{'08_full_scene_en': dialogue}).items():
        assemble(order, clips, out/'takes'/f'{title}.wav', gap=1.5 if title == '08_full_scene_en' else 2.6)
    for name in COMMANDS:
        destination = out/'commands'/f'{name.removeprefix("command_")}.wav'
        assemble([name], clips, destination, intro=0.7, gap=0, outro=0.7)
    for name, job in jobs.items():
        if job['kind'] == 'narrator':
            dest = out/'narrator'/f'{job["line"]}.wav'
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(clips[name], dest)
    files = sorted(out.rglob('*.wav'))
    report = {'engine':args.engine, 'not_final_video_quality':args.engine=='espeak',
              'license': 'local eSpeak placeholder, NOT a production voice' if args.engine=='espeak' else 'USER MUST VERIFY SOURCE TTS LICENSE',
              'files': [{'path': str(f.relative_to(out)), 'bytes': f.stat().st_size, 'sha256':sha256(f)} for f in files]}
    (out/'audio_manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(f'{args.engine.upper()}: {len(clips)} clips; {len(TAKES)+1} takes; {len(COMMANDS)} commands; {len(files)} total WAV in {out}')
    if args.engine == 'espeak':
        print('CAUTION: local robotic eSpeak voices are FOR QA TIMING ONLY, not the final public video.')

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as e:
        print('ERROR:', e, file=sys.stderr)
        sys.exit(1)
