'use strict';
// Solo maneja archivos elegidos por el usuario. No sube BPMN a la web.
class BrowserBpmnFiles {
  constructor() { this.handle=null; this.hash=null; this.version=null; this.baseXml=null; this.recoveries=new Map(); this.name='Sin título.bpmn'; this.busy=false; this.uncertain=null; this.documentId=crypto.randomUUID(); this.lease=null; this.readOnly=false; this.canRelease=()=>!this.busy; this.onMode=()=>{}; }
  async digest(xml) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  validate(xml) {
    const parsed=new DOMParser().parseFromString(xml,'application/xml');
    if (xml.length>8*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || parsed.querySelector('parsererror') || parsed.documentElement.localName!=='definitions' || parsed.documentElement.namespaceURI!=='http://www.omg.org/spec/BPMN/20100524/MODEL') throw new Error('El archivo no es un BPMN válido o supera 8 MB.');
  }
  async pickOpen() {
    const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'Diagrama BPMN',accept:{'application/xml':['.bpmn','.xml']}}]});
    if(handle.requestPermission)await handle.requestPermission({mode:'readwrite'}).catch(()=>{});
    const file=await handle.getFile(),xml=await file.text(); this.validate(xml);
    return {handle,name:file.name,xml,hash:await this.digest(xml)};
  }
  clearCurrent() { try{sessionStorage.removeItem('narabizagui.local.current.v1');}catch{/* Tab storage is optional. */} }
  rememberCurrent() {
    try{if(this.handle?.storageKind!=='microsoft'&&this.handle)sessionStorage.setItem('narabizagui.local.current.v1',this.documentId);else this.clearCurrent();}catch{/* The live file remains usable. */}
  }
  async localSource() {
    let id;try{id=sessionStorage.getItem('narabizagui.local.current.v1');}catch{return null;}
    if(!id||!/^local:[0-9a-f-]{36}$/i.test(id))return null;
    const db=await this.historyDatabase();
    try{
      const entry=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      if(!entry?.handle||await entry.handle.queryPermission({mode:'read'})!=='granted')return null;
      const file=await entry.handle.getFile();return{handle:entry.handle,name:file.name,xml:await file.text()};
    }finally{db.close();}
  }
  detach() { this.lease?.release();this.lease=null;this.handle=null;this.readOnly=false;this.documentId=crypto.randomUUID();this.clearCurrent();this.onMode(); }
  async attach(source) {
    const key=source.handle?await this.identity(source.handle):crypto.randomUUID();
    if(key!==this.documentId){this.lease?.release();this.lease=null;}
    this.documentId=key;this.handle=source.handle||null;this.name=source.name;this.hash=source.hash||await this.digest(source.xml);this.baseXml=source.xml;this.version=this.handle?.etag||null;this.uncertain=null;
    await this.claim();
    if(this.handle)this.rememberCurrent();
  }
  async claim() {
    if(!this.handle){this.readOnly=false;this.onMode();return true;}
    if(window.NaraTabOwnership){
      this.lease=await window.NaraTabOwnership.claim('file:'+this.documentId,{canRelease:()=>this.canRelease(),onRelease:()=>{this.readOnly=true;this.onMode();}});
      this.readOnly=!this.lease?.active;
    }
    this.onMode();return !this.readOnly;
  }
  async takeEditing() {
    if(!this.readOnly)return true;
    window.NaraTabOwnership?.requestRelease('file:'+this.documentId);
    for(let i=0;i<12;i++){if(await this.claim())return true;await new Promise(resolve=>setTimeout(resolve,100));}
    throw Object.assign(new Error('Guarda y termina la edición en la otra pestaña, o cierra allí este archivo. Después vuelve a intentar.'),{code:'FILE_IN_USE'});
  }
  assertWritable(handle=this.handle) {
    if(handle===this.handle&&(this.readOnly||this.lease&&!this.lease.active))throw Object.assign(new Error('Este archivo está abierto para edición en otra pestaña. Usa Editar aquí para transferir la edición.'),{code:'FILE_READ_ONLY'});
  }
  async identity(handle) {
    if(handle.storageKind==='microsoft'){
      return 'microsoft:'+await this.digest(JSON.stringify([handle.driveId,handle.itemId]));
    }
    // Native entry equality keeps equal filenames in different folders independent.
    if(!window.NaraTabOwnership)return this.documentId;
    if(!navigator.locks)return 'local:'+this.documentId;
    return navigator.locks.request('narabizagui-file-identities',async()=>{
      const db=await this.historyDatabase();
      try{
        const entries=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        for(const entry of entries){try{if(await handle.isSameEntry(entry.handle))return entry.id;}catch{/* Unavailable entries retain their history. */}}
        const id='local:'+crypto.randomUUID();
        await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({id,handle});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});return id;
      }finally{db.close();}
    });
  }
  async read({onlyChanged=false}={}) {
    if (!this.handle) return null;
    const file=await this.handle.getFile(onlyChanged&&this.handle.storageKind==='microsoft'?{ifChangedSince:this.version}:undefined);
    if(!file)return null;
    const xml=await file.text();this.validate(xml);
    return {handle:this.handle,name:file.name,xml,hash:await this.digest(xml)};
  }
  async pickSave(name=this.name) {
    return window.showSaveFilePicker({suggestedName:name,types:[{description:'Diagrama BPMN',accept:{'application/xml':['.bpmn']}}]});
  }
  async historyDatabase() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('narabizagui-history',2);
      request.onupgradeneeded=()=>{for(const name of ['revisions','files'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  async backup(source, documentId=this.documentId) {
    if (!source.xml.trim()) return;
    const db=await this.historyDatabase();
    try { await new Promise((resolve,reject)=>{
      const tx=db.transaction('revisions','readwrite');
      tx.objectStore('revisions').put({id:documentId+'|'+source.hash,documentId,name:source.name,sha256:source.hash,date:new Date().toISOString(),xml:source.xml});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo conservar la revisión anterior.'));
    }); } finally {db.close();}
  }
  async revisions({legacy=false}={}) {
    const db=await this.historyDatabase();
    try{return await new Promise((resolve,reject)=>{
      const request=db.transaction('revisions').objectStore('revisions').getAll();
      request.onsuccess=()=>resolve(request.result.filter(r=>legacy?!r.documentId:r.documentId===this.documentId).sort((a,b)=>b.date.localeCompare(a.date)));request.onerror=()=>reject(request.error);
    });}finally{db.close();}
  }
  async preserveRecovery(xml,handle=this.handle) {
    this.validate(xml);const hash=await this.digest(xml),key=(handle?.storageKind==='microsoft'?handle.accountId+'|'+handle.driveId+'|'+handle.itemId:this.name)+'|'+hash;
    if(this.recoveries.has(key)){const previous=this.recoveries.get(key);if(previous.error)throw previous.error;return previous;}
    let result;
    if(handle?.storageKind==='microsoft'){
      try{result={storage:'microsoft',name:(await handle.recoveryCopy(xml)).name};}
      catch(error){if(error.code==='SAVE_UNCERTAIN'){if(this.recoveries.size>=20)this.recoveries.delete(this.recoveries.keys().next().value);this.recoveries.set(key,{error});}throw error;}
    }
    else{const name=this.name.replace(/\.bpmn$/i,'')+' - copia recuperada.bpmn';await this.backup({name,xml,hash});result={storage:'history',name};}
    if(this.recoveries.size>=20)this.recoveries.delete(this.recoveries.keys().next().value);
    this.recoveries.set(key,result);return result;
  }
  async save(xml,handle=this.handle,{canCommit=()=>true}={}) {
    this.validate(xml);
    this.assertWritable(handle);
    if (this.busy) throw new Error('Ya hay un guardado en curso.');
    if(this.uncertain===handle)throw Object.assign(new Error('Hay un guardado sin confirmar. Recarga el archivo antes de volver a guardar.'),{code:'SAVE_UNCERTAIN'});
    this.busy=true;
    let key;try{key=await this.identity(handle);}catch(error){this.busy=false;throw error;}
    let writable,closing=false,newLease;
    if(key!==this.documentId&&window.NaraTabOwnership){newLease=await window.NaraTabOwnership.claim('file:'+key);if(!newLease){this.busy=false;throw Object.assign(new Error('El destino está abierto en otra pestaña. Elige otro archivo.'),{code:'FILE_IN_USE'});}}
    const guard=()=>{this.assertWritable(handle);if(!canCommit())throw Object.assign(new Error('El archivo o la cuenta cambió durante el guardado. Conserva tus cambios.'),{code:'FILE_CHANGED'});};
    const perform=async()=>{
      guard();
      const previous=await handle.getFile(),oldXml=await previous.text(),oldHash=await this.digest(oldXml);
      const same=this.handle && await handle.isSameEntry(this.handle);
      if (same && this.hash!==oldHash) {const error=new Error('El archivo cambió fuera del visor. Exporta tus cambios o carga la revisión del archivo antes de guardar.');error.code='EXTERNAL_CHANGE';throw error;}
      // Cloud documents must not leak through persistent, account-independent history.
      if (handle.storageKind !== 'microsoft') await this.backup({name:previous.name,xml:oldXml,hash:oldHash},key);
      guard();writable=await handle.createWritable({mode:'exclusive'});
      // Segunda lectura después de obtener permiso y conservar la revisión.
      const latest=await handle.getFile();
      if (await this.digest(await latest.text())!==oldHash) {const error=new Error('El archivo cambió durante el guardado. Se conservó la edición del visor.');error.code='EXTERNAL_CHANGE';throw error;}
      guard();await writable.write(xml);guard();closing=true;await writable.close();writable=null;
      const persisted=await handle.getFile(),savedHash=await this.digest(await persisted.text());
      if(savedHash!==await this.digest(xml))throw Object.assign(new Error('No se pudo comprobar el contenido guardado. Recarga antes de volver a guardar.'),{code:'SAVE_NOT_VERIFIED'});
      guard();if(key!==this.documentId){this.lease?.release();this.lease=newLease||null;this.documentId=key;}this.handle=handle;this.name=handle.name;this.hash=savedHash;this.baseXml=xml;this.version=handle.etag||null;this.uncertain=null;this.readOnly=false;await this.claim();this.rememberCurrent();newLease=null;
    };
    try{
      const locks=typeof navigator!=='undefined'&&navigator.locks;
      if(handle.storageKind!=='microsoft'&&locks)await locks.request('narabizagui-local-bpmn-write',{mode:'exclusive'},perform);else await perform();
    }catch(error){if(closing&&!['EXTERNAL_CHANGE','MICROSOFT_PERMISSION','MICROSOFT_CONNECT','THROTTLED'].includes(error.code)){this.uncertain=handle;if(error.code!=='SAVE_NOT_VERIFIED')throw Object.assign(new Error('No se pudo confirmar el guardado. Conserva tus cambios y recarga el archivo antes de guardar de nuevo.'),{code:'SAVE_UNCERTAIN',cause:error});}throw error;}
    finally{if(writable)await writable.abort().catch(()=>{});newLease?.release();this.busy=false;}
  }
}
window.BrowserBpmnFiles=BrowserBpmnFiles;
