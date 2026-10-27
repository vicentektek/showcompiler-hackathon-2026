/**
 * RunQ workspace menu. UI-only commands forwarding to existing verified controls.
 * No audio engine calls, no new shortcuts for GO or emergency actions.
 */
const labels={
  en:{
    File:"File",Edit:"Edit",View:"View",Cues:"Cues",Tools:"Tools",Help:"Help",
    new:"New show",openZip:"Open portable show",openJson:"Open project JSON",
    saveJson:"Save project JSON",saveZip:"Export complete show",
    editor:"Cue Editor",findCue:"Find cue",findScript:"Find in script",
    home:"Home",script:"Script",ai:"AI & Review",audio:"Audio",setup:"Setup",
    operation:"Operation",readiness:"Check readiness",
    guide:"Keyboard & safety guide",guideTitle:"RunQ operator guide",
    guideBody:"Inspecting or searching does not prepare or execute a cue. Only explicit Prepare changes the NEXT GO target. GO and STOP ALL remain in the operator transport. STOP ALL affects audio in the current browser prototype, not external equipment.",
    guideClose:"Close",status:"DESIGN · browser prototype"
  },
  es:{
    File:"Archivo",Edit:"Editar",View:"Ver",Cues:"Cues",Tools:"Herramientas",Help:"Ayuda",
    new:"Nuevo espectáculo",openZip:"Abrir espectáculo ZIP",openJson:"Abrir proyecto JSON",
    saveJson:"Guardar proyecto JSON",saveZip:"Exportar espectáculo completo",
    editor:"Editor de cues",findCue:"Buscar cue",findScript:"Buscar en guion",
    home:"Inicio",script:"Guion",ai:"IA y revisión",audio:"Audio",setup:"Montaje",
    operation:"Operación",readiness:"Comprobar preparación",
    guide:"Guía de teclado y seguridad",guideTitle:"Guía de operación RunQ",
    guideBody:"Seleccionar o buscar no prepara ni ejecuta ningún cue. Solo la acción Preparar cambia el próximo GO. GO y PARAR TODO siguen en el transporte del operador. PARAR TODO afecta al audio de este prototipo de navegador, no a equipos externos.",
    guideClose:"Cerrar",status:"DISEÑO · prototipo web"
  }
};
const menus=[
  {name:"File",items:[
    ["new","newShowBtn"],["openZip","openBundleBtn"],["openJson","openProjectBtn"],
    "divider",["saveJson","saveProjectBtn"],["saveZip","saveBundleBtn"]
  ]},
  {name:"Edit",items:[["editor","view:cues"],["findCue","focus:cueSearchInput"],["findScript","focus:scriptSearchInput"]]},
  {name:"View",items:[
    ["home","view:home"],["editor","view:cues"],["script","view:script"],
    ["ai","view:ai"],["audio","view:audio"],["setup","view:setup"],["operation","view:operation"]
  ]},
  {name:"Cues",items:[["editor","view:cues"],["findCue","focus:cueSearchInput"],["readiness","checkPreflightBtn"]]},
  {name:"Tools",items:[["audio","view:audio"],["setup","view:setup"],["readiness","checkPreflightBtn"]]},
  {name:"Help",items:[["guide","guide"]]}
];
const lang=()=>document.getElementById("uiLocaleSelect")?.value==="es"?"es":"en";
const word=key=>labels[lang()][key]??key;
let menubar;
function closeMenus(){
  menubar?.querySelectorAll("details[open]").forEach(item=>item.open=false);
}
function executeCommand(action){
  if(action==="guide"){showGuide();return}
  if(action.startsWith("view:")){
    document.querySelector('[data-workspace-nav="'+action.slice(5)+'"]')?.click();
    return;
  }
  if(action.startsWith("focus:")){
    const targetId=action.slice(6);
    const workspace=targetId==="cueSearchInput"?"cues":"script";
    document.querySelector('[data-workspace-nav="'+workspace+'"]')?.click();
    requestAnimationFrame(()=>document.getElementById(targetId)?.focus());
    return;
  }
  const target=document.getElementById(action);
  if(target instanceof HTMLElement&&!target.disabled)target.click();
}
let guideDialog;
function showGuide(){
  if(!guideDialog){
    guideDialog=document.createElement("dialog");
    guideDialog.className="runq-guide-dialog";
    guideDialog.innerHTML='<h2></h2><p></p><div class="runq-guide-footer"><button class="btn subtle" type="button"></button></div>';
    document.body.append(guideDialog);
    guideDialog.querySelector("button").addEventListener("click",()=>guideDialog.close());
  }
  guideDialog.querySelector("h2").textContent=word("guideTitle");
  guideDialog.querySelector("p").textContent=word("guideBody");
  guideDialog.querySelector("button").textContent=word("guideClose");
  guideDialog.showModal();
  guideDialog.querySelector("button").focus();
}
function renderMenus(){
  if(!menubar)return;
  closeMenus();menubar.replaceChildren();
  for(const config of menus){
    const details=document.createElement("details");details.className="runq-menu";
    const summary=document.createElement("summary");summary.textContent=word(config.name);
    details.append(summary);
    const group=document.createElement("div");group.className="runq-menu-panel";
    for(const item of config.items){
      if(item==="divider"){
        const hr=document.createElement("div");hr.className="runq-menu-divider";group.append(hr);continue;
      }
      const [label,action]=item;
      const button=document.createElement("button");button.type="button";
      button.textContent=word(label);
      button.addEventListener("click",()=>{
        closeMenus();
        executeCommand(action);
      });
      group.append(button);
    }
    details.append(group);
    details.addEventListener("toggle",()=>{
      if(details.open){
        menubar.querySelectorAll("details[open]").forEach(other=>{if(other!==details)other.open=false});
      }
    });
    menubar.append(details);
  }
  const note=document.createElement("span");note.className="runq-menu-note";note.textContent=word("status");
  menubar.append(note);
}
function init(){
  const topbar=document.querySelector(".topbar");
  if(!topbar||document.querySelector(".runq-menubar"))return;
  menubar=document.createElement("nav");menubar.className="runq-menubar";
  menubar.setAttribute("aria-label","Application menu");
  topbar.after(menubar);
  renderMenus();
  document.getElementById("uiLocaleSelect")?.addEventListener("change",renderMenus);
  document.addEventListener("pointerdown",event=>{
    if(menubar&&!menubar.contains(event.target))closeMenus();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape")closeMenus();
  });
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",init,{once:true});
}else init();
