/**
 * Human-reviewable sound design per approved cue.
 * Displays only persisted cue values. Never infers a model recommendation,
 * performs playback or calls a provider.
 */
import {normalizeCuePlayback} from '../core/cuePlayback.mjs';
import {normalizeCueEntryPolicy} from '../core/cueEntryPolicy.mjs';

const expandedCueIds=new Set();
const el=(tag,className='',text='')=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
};
const label=(name,control)=>{const wrap=el('label','rq-sound-field');wrap.append(el('span','',name),control);return wrap;};
const number=(value,min,max,step=0.1)=>{
  const input=el('input');input.type='number';input.min=String(min);input.max=String(max);
  input.step=String(step);input.value=String(value);return input;
};
const select=(pairs,value)=>{
  const node=el('select');
  for(const [id,title] of pairs){const option=el('option','',title);option.value=id;node.append(option);}
  node.value=value;return node;
};

export function appendCueSoundDesign(card,cue,{spanish=false,onApply}={}){
  const tr=(en,es)=>spanish?es:en;
  const playback=normalizeCuePlayback(cue.playback??{});
  const entry=normalizeCueEntryPolicy(cue.entryPolicy??{});
  const plan=cue.actions.find(action=>action.type==='PLAN_AUDIO');
  const file=cue.actions.some(action=>action.type==='PLAY')||(cue.audioTracks??[]).length>0;
  const details=el('details','rq-sound-design');
  details.dataset.soundDesignCue=cue.id;
  details.open=expandedCueIds.has(cue.id);
  details.addEventListener('toggle',()=>{
    if(details.open)expandedCueIds.add(cue.id);
    else expandedCueIds.delete(cue.id);
  });
  const summary=el('summary','rq-sound-design-summary');
  const title=el('strong','',tr('Sound design','Diseño sonoro'));
  const chips=el('span','rq-sound-design-chips');
  const duration=playback.endAtMs!==null
    ? ((playback.endAtMs-playback.startAtMs)/1000).toFixed(1)+' s'
    : file?tr('Duration: source file','Duración: archivo original'):
      tr('Duration: not specified','Duración: sin definir');
  chips.textContent=[
    duration,playback.gainDb+' dB',
    tr('In','Entrada')+' '+(playback.fadeInMs/1000)+' s',
    tr('Out','Salida')+' '+(playback.fadeOutMs/1000)+' s',
    playback.loop?tr('Loop on','Loop activo'):tr('One shot','Una vez'),
    entry.mode==='STOP_PREVIOUS'?tr('Stop previous','Detener anteriores'):tr('Overlap','Solapar')
  ].join(' · ');
  summary.append(title,chips);details.append(summary);

  const body=el('div','rq-sound-design-body');
  if(plan){
    body.append(label(tr('Proposed sound description','Descripción de sonido propuesta'),
      Object.assign(el('p','rq-sound-design-prompt',plan.prompt),{title:plan.prompt})));
  } else {
    body.append(el('p','rq-sound-design-help',file
      ?tr('The audio file is linked. These are the actual cue settings.','El archivo está vinculado. Estos son los ajustes reales del cue.')
      :tr('No sound description is attached to this cue.','Este cue no tiene descripción sonora vinculada.')));
  }
  const form=el('div','rq-sound-design-fields');
  const gain=number(playback.gainDb,-60,0,1);
  const fadeIn=number(playback.fadeInMs/1000,0,10,0.1);
  const fadeOut=number(playback.fadeOutMs/1000,0,10,0.1);
  const loop=select([['off',tr('Once','Una vez')],['on',tr('Loop','Bucle')]],playback.loop?'on':'off');
  const mode=select([['OVERLAP',tr('Overlap','Solapar')],['STOP_PREVIOUS',tr('Stop previous sounds','Detener sonidos anteriores')]],entry.mode);
  const previousFade=number(entry.fadeOutMs/1000,0,10,0.1);
  const outControl=label(tr('Fade out (s)','Salida (s)'),fadeOut);
  const stopFadeControl=label(tr('Previous fade (s)','Fade anteriores (s)'),previousFade);
  const sync=()=>{
    fadeOut.disabled=loop.value==='on';
    if(loop.value==='on')fadeOut.value='0';
    previousFade.disabled=mode.value!=='STOP_PREVIOUS';
    stopFadeControl.hidden=mode.value!=='STOP_PREVIOUS';
  };
  loop.addEventListener('change',sync);mode.addEventListener('change',sync);
  form.append(label(tr('Level (dB)','Nivel (dB)'),gain),
    label(tr('Fade in (s)','Entrada (s)'),fadeIn),outControl,
    label(tr('Playback','Reproducción'),loop),
    label(tr('On GO','Al ejecutar GO'),mode),stopFadeControl);
  sync();
  body.append(form);

  const foot=el('div','rq-sound-design-footer');
  const note=el('p','rq-sound-design-help',tr(
    'No AI timing or intensity estimate is stored yet. Values shown are current cue settings. Actual duration depends on the imported audio.',
    'Todavía no hay estimación de duración ni intensidad de IA guardada. Se muestran los ajustes actuales. La duración real depende del audio importado.'));
  const save=el('button','btn accent small',tr('Save cue sound settings','Guardar ajustes del cue'));
  save.type='button';
  const status=el('output','rq-sound-design-status');status.setAttribute('role','status');
  save.addEventListener('click',()=>{
    const inputs=[gain,fadeIn,fadeOut,previousFade];
    if(inputs.some(input=>!input.checkValidity()||input.value.trim()==='')){
      status.textContent=tr('Check all numeric fields.','Revisa los campos numéricos.');return;
    }
    const result=onApply?.({
      id:cue.id,levelDb:Number(gain.value),
      fadeInMs:Math.round(Number(fadeIn.value)*1000),
      fadeOutMs:loop.value==='on'?0:Math.round(Number(fadeOut.value)*1000),
      loop:loop.value==='on',entryMode:mode.value,
      entryFadeMs:Math.round(Number(previousFade.value)*1000),
    });
    status.textContent=result?.ok
      ?tr('Saved. No GO executed.','Guardado. No se ha ejecutado GO.')
      :tr('Not saved: ','No guardado: ')+(result?.error??'Invalid settings');
  });
  foot.append(save,status);body.append(note,foot);details.append(body);card.append(details);
  return details;
}
