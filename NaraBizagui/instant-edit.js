'use strict';
(() => {
  const $=id=>document.getElementById(id), forms=['propertyForm','erdTableForm','erdRelationForm','geometryForm'];
  const dirty=new Map();let timer,applying=false,composing=false;
  const note=document.createElement('p');note.id='instantEditStatus';note.className='instant-status';note.setAttribute('role','status');note.setAttribute('aria-live','polite');$('rightPanel').appendChild(note);
  const focusSnapshot=()=>{const el=document.activeElement;return el?.id?{id:el.id,start:el.selectionStart,end:el.selectionEnd}:null;};
  function restore(snapshot){const el=snapshot&&$(snapshot.id);if(!el||el.disabled||!el.getClientRects().length)return;el.focus({preventScroll:true});if(snapshot.start!==null&&snapshot.start!==undefined)try{el.setSelectionRange(snapshot.start,snapshot.end);}catch{/* Not a text field. */}}
  function message(text,error=false){note.textContent=text;note.classList.toggle('error',error);}
  function group(control){return control.closest('form')?.id||control.id;}
  function valid(control){return !control.disabled&&(!control.checkValidity||control.checkValidity());}
  function flush(){
    clearTimeout(timer);if(applying||composing)return !dirty.size;
    const snapshot=focusSnapshot();applying=true;let success=true;
    try{
      for(const [key,controlId]of [...dirty]){
        const control=$(controlId),form=forms.includes(key)?$(key):null;
        if(!control){dirty.delete(key);continue;}
        if(form?!form.checkValidity():!valid(control))throw Error(control.validationMessage||'Completa un valor válido. El cambio permanece pendiente.');
        if(key==='propertyForm')window.NaraApplyProperties();
        else if(form){if(!key.startsWith('erd')||window.NaraER.pending())form.onsubmit?.({preventDefault(){}});if(key.startsWith('erd')&&window.NaraER.pending())throw Error($('status').textContent||'Revisa el valor indicado.');}
        else control.onchange?.(new Event('change'));
        dirty.delete(key);
      }
      message('Cambios aplicados automáticamente.');
    }catch(error){success=false;message(error.message,true);}
    finally{applying=false;queueMicrotask(()=>{restore(snapshot);window.naraAutoSave?.refresh();});}
    return success;
  }
  function schedule(control,immediate=false){
    if(control.disabled)return;dirty.set(group(control),control.id);message('Aplicando cambio…');clearTimeout(timer);
    if(immediate)flush();else timer=setTimeout(flush,300);
  }
  const relevant=el=>el?.id&&(el.closest('#propertyForm,#erdTableForm,#erdRelationForm,#geometryForm')||el.id.startsWith('style'))&&!['documentActivity','subprocessTarget','documentFormat','documentUse'].includes(el.id);
  $('rightPanel').addEventListener('input',event=>{if(!applying&&relevant(event.target))schedule(event.target,event.target.type==='color');});
  $('rightPanel').addEventListener('change',event=>{if(!applying&&relevant(event.target))schedule(event.target,true);});
  $('rightPanel').addEventListener('focusout',event=>{if(relevant(event.target)&&dirty.size)flush();});
  $('rightPanel').addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});
  $('rightPanel').addEventListener('compositionend',event=>{composing=false;if(relevant(event.target))schedule(event.target);});
  function cancelPending(event){
    if(event.key==='Escape'&&dirty.size){event.preventDefault();event.stopPropagation();clearTimeout(timer);dirty.clear();window.NaraRefreshProperties();window.NaraER?.renderProperties();window.NaraStylePanel?.refresh();window.naraAutoSave?.refresh();message('Edición pendiente cancelada.');}
  }
  $('rightPanel').addEventListener('keydown',cancelPending);
  document.addEventListener('pointerdown',event=>{
    if(!dirty.size||event.target.closest('#rightPanel'))return;
    if(!flush()){event.preventDefault();event.stopPropagation();message('Corrige el valor indicado o pulsa Escape para cancelar la edición pendiente.',true);}
  },true);
  document.addEventListener('click',event=>{if(dirty.size&&!event.target.closest('#rightPanel')&&!flush()){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',event=>{cancelPending(event);if((event.ctrlKey||event.metaKey)&&['s','z','y'].includes(event.key.toLowerCase())&&(event.key.toLowerCase()==='s'||!event.target.matches('input,textarea,select'))&&!flush()){event.preventDefault();event.stopImmediatePropagation();}},true);
  for(const id of forms){const submit=$(id)?.querySelector('button[type="submit"],button.primary-button');if(submit)submit.hidden=true;}
  for(const id of ['documentActivity','subprocessTarget'])$(id).addEventListener('change',()=>{if($(id).value)$(id==='documentActivity'?'connectDocument':'linkSubprocess').click();});
  $('connectDocument').hidden=true;$('linkSubprocess').hidden=true;
  for(const id of ['styleFill','styleStroke','styleStrokeWidth','styleFontColor','styleFontSize','styleBold','styleAlign']){
    const el=$(id),original=el.onchange;
    el.onchange=event=>{if(applying)original?.(event);};
  }
  $('geometryForm').querySelector('button[type="submit"]').hidden=true;
  window.NaraInstantEdit={flush,pending:()=>!applying&&dirty.size>0,get applying(){return applying;}};
})();
