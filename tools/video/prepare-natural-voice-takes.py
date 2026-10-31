#!/usr/bin/env python3
"""Package the 3 NATURAL Descript British actor samples (provided by the user).

Input (PCM WAV mono 48 kHz, 16-bit):
  James_L06.wav / Maya_L14.wav / Ella_L23.wav
NO speech synthesis, no provider calls, no cloud, no changing original samples.
Use these takes with Chromium --use-file-for-fake-audio-capture to test REAL ASR.
"""
import argparse
import hashlib
import json
import shutil
import wave
from pathlib import Path

RATE=48000
FILES={'L6':'James_L06.wav','L14':'Maya_L14.wav','L23':'Ella_L23.wav'}
TRANSCRIPTS={
  'L6':'Listen carefully. The theatre is holding its breath.',
  'L14':'When the clock strikes once, open the envelope.',
  'L23':'When the red light comes on, we make our choice.',
}
TAKES={
  '01_linear_en':['L6','L14','L23'],
  '02_jump_en':['L6','L23'],
  '03_rewind_en':['L23','L6'],
  '04_repeat_en':['L14','L14'],
  '05_disarmed_en':['L6','L14'],
}

def load(path):
  with wave.open(str(path),'rb') as f:
    if (f.getnchannels(),f.getsampwidth(),f.getframerate(),f.getcomptype()) != (1,2,RATE,'NONE'):
      raise ValueError('Expected WAV PCM16 mono 48 kHz: '+str(path)+
                       ' (convert with ffmpeg -i source -ac 1 -ar 48000 -c:a pcm_s16le target.wav)')
    data=f.readframes(f.getnframes())
  if len(data)<RATE//5:
    raise ValueError('Clip too short: '+str(path))
  return data

def output_wav(path,chunks):
  path.parent.mkdir(parents=True,exist_ok=True)
  with wave.open(str(path),'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
    for chunk in chunks:f.writeframes(chunk)

def silence(seconds):
  return b'\0'*(round(seconds*RATE)*2)

def sha(path):
  h=hashlib.sha256()
  with path.open('rb') as f:
    for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
  return h.hexdigest()

def build(source,output,lead=18.0,gap=3.5):
  if not 5 <= lead <= 60:raise ValueError('lead must be 5–60 seconds')
  if not 2 <= gap <= 15:raise ValueError('gap must be 2–15 seconds')
  clips={}
  for line,filename in FILES.items():
    clips[line]=load(source/filename)
  output.mkdir(parents=True,exist_ok=True)
  for line,filename in FILES.items():
    dst=output/'actors'/filename
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source/filename,dst)
  manifest={'status':'READY_PRERECORDED_AUDIO_NOT_ASR_TESTED',
            'origin':'Three distinct user-supplied Descript-generated British stock voices',
            'usage':'Chromium fake microphone; real provider recognition is separately opt-in',
            'script_lines':TRANSCRIPTS,'sample_rate_hz':RATE,'bits_per_sample':16,
            'mic_lead_seconds':lead,'gap_seconds':gap,'takes':{}}
  for title,sequence in TAKES.items():
    audio=[silence(1.25)]
    for idx,line in enumerate(sequence):
      if idx:
        audio.append(silence(4.0 if title=='04_repeat_en' else gap))
      audio.append(clips[line])
    audio.append(silence(1.0))
    p=output/'takes'/f'{title}.wav'
    output_wav(p,audio)
    mic=output/'mic-ready'/f'{title}_mic.wav'
    output_wav(mic,[silence(lead),*audio])
    manifest['takes'][title]={'sequence':sequence,'source_wav':str(p.relative_to(output)),
      'chromium_mic_wav':str(mic.relative_to(output)),'sha256':sha(mic),
      'duration_seconds':round((mic.stat().st_size-44)/(RATE*2),2),
      'expected_cues':{'01_linear_en':['Q01','Q02','Q03'],
        '02_jump_en':['Q01','Q03'],'03_rewind_en':['Q03','Q01'],
        '04_repeat_en':['Q02','Q02'],'05_disarmed_en':[]}[title]}
  (output/'natural_voice_manifest.json').write_text(
    json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
  print('Natural voice samples packaged:',output)
  for name,info in manifest['takes'].items():
    print(' ',name,'->',info['chromium_mic_wav'],info['duration_seconds'],'s')
  print('ASR/Autopilot has NOT been executed by this script; clips are recorded human-like stock voices.')
  return manifest

def main():
  parser=argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--source-dir',required=True,type=Path,
                      help='Directory containing James_L06.wav, Maya_L14.wav, Ella_L23.wav')
  parser.add_argument('--output',type=Path,default=Path('production/runq-video-kit/natural-voices'))
  parser.add_argument('--lead',type=float,default=18)
  parser.add_argument('--gap',type=float,default=3.5)
  a=parser.parse_args()
  build(a.source_dir,a.output,a.lead,a.gap)
if __name__=='__main__':main()
