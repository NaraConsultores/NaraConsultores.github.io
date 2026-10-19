'use strict';
(() => {
  function compact(state) {
    const result={...state,elementsOmitted:true};
    delete result.elements;delete result.dataModel;delete result.xml;
    return result;
  }
  function create({snapshot,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
    function state(){
      const s=snapshot();let reason=null;
      if(!s.ready&&s.error)reason='initialization_failed';
      else if(s.loading)reason='loading';
      else if(!s.ready||s.starting)reason='initializing';
      else if(s.restoring)reason='restoring_microsoft';
      else if(s.readOnly)reason='file_read_only';
      else if(s.saving)reason='saving';
      else if(s.synchronizing)reason='synchronizing';
      else if(s.dialog)reason='file_dialog';
      else if(s.form)reason='form_pending';
      const canRead=!['initialization_failed','loading','initializing','restoring_microsoft'].includes(reason);
      const retryable=['loading','initializing','restoring_microsoft','saving','synchronizing'].includes(reason);
      return{status:reason==='initialization_failed'?'error':reason?'waiting':'ready',canRead,canEdit:!reason,busyReason:reason,retryable,...(reason==='initialization_failed'?{message:String(s.error).slice(0,1000),recovery:'preserve_then_reload'}:reason==='form_pending'?{recovery:'resolve_draft'}:reason==='file_dialog'?{recovery:'finish_file_dialog'}:retryable?{retryAfterMs:250,recovery:'wait_once'}:{})};
    }
    async function wait(mode='read',timeoutMs=0){
      const started=now();let current=state();
      while(!(mode==='read'?current.canRead:current.canEdit)&&current.retryable&&now()-started<timeoutMs){await delay(Math.min(50,timeoutMs-(now()-started)));current=state();}
      return{...current,waitMs:now()-started};
    }
    function failure(current){
      const code=current.busyReason==='file_read_only'?'FILE_READ_ONLY':current.busyReason==='initialization_failed'?'EDITOR_INITIALIZATION_FAILED':current.busyReason==='form_pending'?'FORM_PENDING':current.busyReason==='file_dialog'?'FILE_DIALOG_OPEN':'EDITOR_NOT_READY';
      return Object.assign(Error(current.message||({file_read_only:'El archivo se edita en otra pestaña. Usa Editar aquí para transferir la edición.',form_pending:'Hay una edición de propiedades pendiente.',file_dialog:'Termina la operación del selector de archivos.',restoring_microsoft:'Microsoft todavía está retomando el documento.'})[current.busyReason]||'El editor todavía no está listo.'),{code,...current});
    }
    return{state,wait,failure};
  }
  window.NaraEditorReadiness={create,compact};
})();
