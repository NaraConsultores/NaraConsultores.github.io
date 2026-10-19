import {problem, bpmnName, graphUrl, FILE_SCOPES, SITE_SCOPES, sha256} from './microsoft-files.js';

export const MICROSOFT_FILES_CONTRACT = 'microsoft-files-v1';
export const MICROSOFT_FILE_CAPABILITIES = Object.freeze({contract:MICROSOFT_FILES_CONTRACT,resolve:true,list:true,create:true,open:true,attach:true,autoSave:true,receipts:true});
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const clone = value => JSON.parse(JSON.stringify(value));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorFields = ['code','phase','requestId','retryable','retryAfterMs','recovery','created','verified','attached','remote','currentSaved','currentSavedRemote'];
const receiptError = error => Object.fromEntries(errorFields.filter(k => error[k] !== undefined).map(k => [k,error[k]]));
const identity = stamp => stable(stamp);

// One instance per editor tab. Tokens, XML and signed URLs never enter references or receipts.
export class MicrosoftFileLifecycle {
  constructor({auth, files, workspace, editor, now = Date.now}) {
    Object.assign(this,{auth,files,workspace,editor,now});
    this.generation = crypto.randomUUID(); this.refs = new Map(); this.receipts = new Map(); this.active = null;
    this.capabilities=MICROSOFT_FILE_CAPABILITIES;
  }
  identity() {
    if (!this.auth.account) throw problem('MICROSOFT_CONNECT','Conecta Microsoft en el editor. El vínculo MCP es independiente.');
    const stamp = this.workspace.stamp(), key = identity(stamp);
    if (key !== this.identityKey) { this.identityKey = key; this.accountRef = crypto.randomUUID(); this.refs.clear(); }
    return {stamp,accountRef:this.accountRef,tenantId:this.auth.account.tenantId};
  }
  account(args) {
    const current = this.identity();
    if (args.accountRef !== current.accountRef) throw problem('ACCOUNT_CHANGED','La cuenta o su generación cambió. Lee el estado y resuelve otra vez.');
    if (args.expectedTenantId !== current.tenantId) throw problem('TENANT_MISMATCH','El tenant activo no coincide con el solicitado. No se seleccionó otra cuenta.');
    return current;
  }
  put(value, sessionId, scopeRef = null) {
    if (this.refs.size >= 512) throw problem('REFERENCE_LIMIT','Resuelve de nuevo en una sesión de trabajo más corta.');
    const key = crypto.randomUUID();
    this.refs.set(key,{...value,sessionId,scopeRef,stamp:this.workspace.stamp(),expires:this.now()+15*60*1000});
    return key;
  }
  ref(key, sessionId, kind) {
    const ref = this.refs.get(key);
    if (!ref || ref.expires < this.now() || ref.sessionId !== sessionId) throw problem('OUT_OF_SCOPE','La referencia no pertenece a esta sesión o venció. Resuelve el destino otra vez.');
    this.workspace.assert(ref.stamp);
    if (kind && ref.kind !== kind) throw problem('INVALID_TARGET','La referencia no tiene el tipo requerido.');
    return ref;
  }
  scope(args, action = 'read') {
    this.account(args);
    const scope = this.ref(args.scopeRef,args.sessionId,'scope');
    if (!scope.actions.includes(action)) throw problem('OUT_OF_SCOPE','La acción no está incluida en el alcance explícito.');
    return scope;
  }
  expose(item, driveId, scopeRef, sessionId, siteId = null) {
    if (item.remoteItem) throw problem('OUT_OF_SCOPE','El acceso directo apunta a otro recurso. Resuelve sus IDs explícitamente.');
    const kind = item.folder || item.itemId === 'root' ? 'folder' : item.file && /\.bpmn$/i.test(item.name) ? 'file' : null;
    if (!kind || !item.id && !item.itemId) throw problem('INVALID_TARGET','Selecciona una carpeta o un archivo BPMN.');
    const value = {kind,driveId,itemId:item.id||item.itemId,siteId:item.parentReference?.siteId||siteId,name:item.name,webUrl:item.webUrl||null,eTag:item.eTag||null,size:item.size??null};
    const key = this.put(value,sessionId,scopeRef);
    return {...value,[kind==='folder'?'folderRef':'fileRef']:key};
  }
  async checked(args, reference, action, kind) {
    const scope = this.scope(args,action), ref = this.ref(reference,args.sessionId,kind);
    if (ref.scopeRef !== args.scopeRef) throw problem('OUT_OF_SCOPE','La referencia pertenece a otro alcance.');
    const item = await this.files.metadata(ref.driveId,ref.itemId); this.workspace.assert(scope.stamp);
    if (item.remoteItem) throw problem('OUT_OF_SCOPE','No se siguen accesos directos fuera del recurso autorizado.');
    if (kind==='folder' && !item.folder || kind==='file' && (!item.file || !/\.bpmn$/i.test(item.name))) throw problem('INVALID_TARGET','El recurso cambió de tipo.');
    const resourceTenant = item.sharepointIds?.tenantId || item.parentReference?.sharepointIds?.tenantId;
    if (resourceTenant && resourceTenant !== this.auth.account.tenantId) throw problem('TENANT_MISMATCH','El recurso pertenece a otro tenant. Selección explícita requerida.');
    if (scope.rootKind === 'site') {
      if (!scope.drives.includes(ref.driveId)) throw problem('OUT_OF_SCOPE','La biblioteca no pertenece al sitio resuelto.');
    } else if (scope.rootKind === 'file') {
      if (ref.driveId !== scope.driveId || item.id !== scope.itemId) throw problem('OUT_OF_SCOPE','El archivo no coincide con el autorizado.');
    } else {
      if (ref.driveId !== scope.driveId) throw problem('OUT_OF_SCOPE','La biblioteca cambió.');
      let ancestor = item, depth = 0; const seen = new Set();
      while (ancestor.id !== scope.itemId) {
        const parent = ancestor.parentReference;
        if (!parent?.id || parent.driveId && parent.driveId !== scope.driveId || seen.has(parent.id) || ++depth > 64) throw problem('OUT_OF_SCOPE','El recurso ya no está dentro de la carpeta autorizada.');
        seen.add(parent.id);
        ancestor = await this.files.metadata(scope.driveId,parent.id); this.workspace.assert(scope.stamp);
      }
    }
    return {scope,ref,item};
  }
  async status({sessionId,requestId} = {}) {
    let microsoft = {state:'disconnected',connected:false};
    if (this.auth.account) { const {accountRef,tenantId} = this.identity(); microsoft = {state:'connected',connected:true,accountRef,tenantId}; }
    const state = this.editor.state(), handle = state.handle;
    const remote = handle?.storageKind==='microsoft' ? handle.remoteInfo() : null;
    const targetMatches = Boolean(microsoft.connected && handle?.accountId===this.auth.account?.homeAccountId && handle?.generation===this.auth.generation && remote && remote.driveId === state.target?.driveId && remote.itemId === state.target?.itemId);
    const unresolved=[...this.receipts.values()].some(r=>r.identityKey===this.identityKey&&r.public.phase==='result_unknown');
    const autoSave = {...state.autoSave,blocked:state.autoSave.blocked||(state.readOnly?'FILE_READ_ONLY':null)||(unresolved?'RESULT_UNKNOWN':null),targetMatches,effective:Boolean(state.autoSave.enabled && targetMatches && !state.readOnly && !state.autoSave.blocked && !unresolved && !state.unappliedProperties && !state.recoveryRequired && !this.active),lastVerifiedRevision:!state.dirty&&targetMatches?state.revision:null,lastVerifiedETag:remote?.eTag||null};
    let receipt;
    if (requestId) { const entry = this.receipts.get(requestId); if (entry && entry.identityKey === this.identityKey && entry.sessionId===sessionId) receipt = clone(entry.public); else receipt={requestId,phase:'result_unknown',code:'OPERATION_RECEIPT_EXPIRED',recovery:'read_exact_destination',retryable:false}; }
    return {contract:MICROSOFT_FILES_CONTRACT,operationGeneration:this.generation,sessionId,microsoft,connection:state.connection,readiness:state.readiness,document:{documentId:state.documentId,revision:state.revision,savedRevision:!state.dirty&&targetMatches?state.revision:null,dirty:state.dirty,unappliedProperties:state.unappliedProperties,target:state.target,state:state.recoveryRequired?'recovery_required':this.active?'saving':state.unappliedProperties?'draft_pending':state.dirty?'dirty':targetMatches?'remote_ready':state.target?'local_ready':'no_destination'},remote,autoSave,...(receipt?{receipt}:{})};
  }
  async resolve(args) {
    const current = this.account(args), target = args.target;
    let item, driveId, siteId, rootKind, drives = [];
    if (target.siteUrl || target.siteId) {
      const site = target.siteUrl ? await this.files.site(target.siteUrl) : await this.files.request(`sites/${encodeURIComponent(target.siteId)}?$select=id,displayName,webUrl`,{},SITE_SCOPES);
      this.workspace.assert(current.stamp); siteId = site.id;
      if (!target.driveId) {
        if (args.requestedScope !== 'site') throw problem('INVALID_TARGET','El sitio contiene bibliotecas; solicita alcance de sitio para elegir una.');
        rootKind = 'site'; item = {id:site.id,name:site.displayName,webUrl:site.webUrl};
      } else {
        let page = await this.files.libraries(siteId), count = 0;
        for (;;) { this.workspace.assert(current.stamp); drives.push(...page.value.map(d=>d.id)); if (!page['@odata.nextLink']) break; if (++count>20) throw problem('INVALID_TARGET','Demasiadas bibliotecas; resuelve un destino más concreto.'); page = await this.page(page['@odata.nextLink'],`sites/${encodeURIComponent(siteId)}/drives`,SITE_SCOPES); }
        if (!drives.includes(target.driveId)) throw problem('OUT_OF_SCOPE','La biblioteca no pertenece al sitio especificado.');
        driveId = target.driveId; item = await this.files.metadata(driveId,target.itemId||'root');
      }
    } else if (target.sharingUrl) {
      item = await this.files.shared(target.sharingUrl); driveId = item.parentReference?.driveId;
    } else { driveId = target.driveId; item = await this.files.metadata(driveId,target.itemId); }
    this.workspace.assert(current.stamp);
    if (item.remoteItem) throw problem('OUT_OF_SCOPE','El acceso directo requiere resolver el recurso de destino explícito.');
    if (!rootKind) rootKind = item.folder ? 'folder' : item.file && /\.bpmn$/i.test(item.name) ? 'file' : null;
    if (!rootKind || rootKind !== args.requestedScope || rootKind!=='site' && !driveId) throw problem('INVALID_TARGET','El enlace/ID no coincide con el tipo de alcance solicitado.');
    const resourceTenant=item.sharepointIds?.tenantId;
    if(resourceTenant&&resourceTenant!==current.tenantId)throw problem('TENANT_MISMATCH','El recurso no corresponde al tenant activo.');
    const scopeRef = this.put({kind:'scope',rootKind,driveId,itemId:item.id,siteId:siteId||item.parentReference?.siteId||null,actions:args.actions,drives},args.sessionId);
    const result = rootKind==='site'?{kind:'site',siteId,name:item.name,webUrl:item.webUrl}:this.expose(item,driveId,scopeRef,args.sessionId,siteId);
    return {contract:MICROSOFT_FILES_CONTRACT,scopeRef,...result,accountRef:current.accountRef,tenantId:current.tenantId,actions:args.actions};
  }
  async page(nextLink, endpoint, scopes = FILE_SCOPES) {
    const url = new URL(graphUrl(nextLink)), base = new URL(graphUrl(endpoint));
    if (url.pathname !== base.pathname) throw problem('OUT_OF_SCOPE','La página no corresponde a la colección autorizada.');
    return this.files.request(url.href,{},scopes);
  }
  async list(args) {
    const scope=this.scope(args); let endpoint, page, folder, scopes=FILE_SCOPES;
    if (args.kind==='libraries') {
      if(scope.rootKind!=='site')throw problem('OUT_OF_SCOPE','Listar bibliotecas requiere alcance explícito de sitio.');
      endpoint=`sites/${encodeURIComponent(scope.siteId)}/drives`; scopes=SITE_SCOPES;
    } else {
      folder=await this.checked(args,args.folderRef,'read','folder');
      endpoint=`drives/${encodeURIComponent(folder.ref.driveId)}/items/${encodeURIComponent(folder.item.id)}/children`;
    }
    if(args.cursor){const cursor=this.ref(args.cursor,args.sessionId,'cursor');if(cursor.scopeRef!==args.scopeRef||cursor.endpoint!==endpoint||cursor.pageSize!==args.pageSize)throw problem('OUT_OF_SCOPE','El cursor no corresponde a esta consulta.');page=await this.page(cursor.nextLink,endpoint,scopes);}
    else page=await this.files.request(`${endpoint}?$top=${args.pageSize}`,{},scopes);
    this.workspace.assert(scope.stamp);
    const entries=[];
    for(const item of page.value||[]){
      if(args.kind==='libraries'){if(!scope.drives.includes(item.id))scope.drives.push(item.id);entries.push({...this.expose({id:'root',folder:{},name:item.name,webUrl:item.webUrl},item.id,args.scopeRef,args.sessionId,scope.siteId),kind:'library'});}
      else if(!item.remoteItem&&(item.folder||item.file&&/\.bpmn$/i.test(item.name)))entries.push(this.expose(item,folder.ref.driveId,args.scopeRef,args.sessionId,scope.siteId));
    }
    const nextLink=page['@odata.nextLink'];
    if(nextLink){const url=new URL(graphUrl(nextLink));if(url.pathname!==new URL(graphUrl(endpoint)).pathname)throw problem('OUT_OF_SCOPE','Microsoft devolvió una página fuera de alcance.');}
    return {contract:MICROSOFT_FILES_CONTRACT,entries,complete:!nextLink,nextCursor:nextLink?this.put({kind:'cursor',endpoint,nextLink,pageSize:args.pageSize},args.sessionId,args.scopeRef):null};
  }
  check(args) {
    const state=this.editor.state();
    if(state.revision!==args.expectedRevision)throw problem('REVISION_CONFLICT','El diagrama cambió; lee la nueva revisión.');
    if(state.documentId!==args.expectedDocumentId||stable(state.target)!==stable(args.expectedTarget))throw problem('FILE_CHANGED','Cambió el documento o destino actual.');
    if(state.unappliedProperties)throw problem('FORM_PENDING','Aplica o cancela la edición pendiente por decisión del usuario.');
    if(state.uncertain)throw problem('SAVE_UNCERTAIN','Hay un guardado incierto. Reconcilia antes de cambiar el destino.');
    return state;
  }
  async run(action,args,perform) {
    this.account(args);
    if(args.operationGeneration!==this.generation)throw problem('OPERATION_RECEIPT_EXPIRED','Cambió la generación del editor. Consulta el destino exacto antes de repetir.');
    const fingerprint=stable({action,...args}),previous=this.receipts.get(args.requestId);
    if(previous){if(previous.fingerprint!==fingerprint)throw problem('REQUEST_ID_REUSED','El identificador pertenece a otros argumentos.');if(previous.public.error)throw Object.assign(problem(previous.public.error.code,previous.public.message),previous.public.error);return{...clone(previous.public),replayed:true,current:await this.status(args)};}
    this.scope(args,action);
    if(['create','autosave'].includes(action)&&[...this.receipts.values()].some(r=>r.identityKey===this.identityKey&&r.public.phase==='result_unknown'))throw problem('RESULT_UNKNOWN','Hay una escritura sin reconciliar. Consulta su recibo y el destino exacto antes de otra escritura.');
    if(this.active)throw problem('BUSY','Espera el resultado de la operación actual.');
    await this.editor.prepare(args.expectedRevision);this.check(args);
    if(this.receipts.size>=64)throw problem('REFERENCE_LIMIT','Se alcanzó el límite de recibos de esta pestaña. Conserva los resultados antes de iniciar otra sesión.');
    const record={fingerprint,identityKey:this.identityKey,sessionId:args.sessionId,public:{requestId:args.requestId,phase:'prepared',created:false,verified:false,attached:false}};
    if(!args.dryRun)this.receipts.set(args.requestId,record);
    this.active=record;
    const stamp=this.workspace.stamp();let release;
    const guard=()=>{this.workspace.assert(stamp);return this.check(args);};
    guard.identity=()=>this.workspace.assert(stamp);
    try{
      release=this.editor.lock();
      const result=await perform(record.public,guard);
      record.public={...record.public,...result,requestId:args.requestId,applied:!args.dryRun&&!result.reconciliationRequired,phase:result.phase||'completed',...(args.dryRun?{dryRun:true,phase:'prepared'}:{})};
    }catch(error){
      const unknown=['SAVE_UNCERTAIN','SAVE_NOT_VERIFIED','RESULT_UNKNOWN'].includes(error.code)||record.public.created&&!record.public.verified;
      if(unknown)this.editor.enableAutoSave(false);
      Object.assign(error,{requestId:args.requestId,phase:unknown?'result_unknown':record.public.verified?'verified_unattached':'failed',created:record.public.created,verified:record.public.verified,attached:record.public.attached,...(record.public.remote?{remote:record.public.remote}:{}),...(record.public.currentSaved?{currentSaved:true,currentSavedRemote:record.public.currentSavedRemote}:{}),retryable:false,recovery:unknown?'read_receipt_and_exact_destination':'read_and_replan'});
      record.public={...record.public,...receiptError(error),message:error.message,error:receiptError(error)};throw error;
    }finally{release?.();this.active=null;}
    const deadline=this.now()+(args.waitForSavedMs||0);
    while(this.now()<deadline){const s=this.editor.state();if(!s.dirty&&!s.autoSave.running||s.autoSave.blocked)break;await pause(50);}
    const current=await this.status({sessionId:args.sessionId});
    record.public={...record.public,...current,remote:record.public.remote||current.remote};
    return clone(record.public);
  }
  complete(source) {
    const r=source.remote;
    if(!r?.driveId||!r.itemId||!r.parentItemId||!r.webUrl||!r.eTag||!r.sha256)throw problem('SAVE_NOT_VERIFIED','Faltan identificadores o prueba de persistencia remota.');
    return r;
  }
  create(args) { return this.run('create',args,async(record,guard)=>{
    if(args.attach){this.scope(args,'attach');this.scope(args,'autosave');}
    else if(args.autoSave)throw problem('INVALID_TARGET','Activar autoguardado requiere asociar el archivo.');
    const {ref,item}=await this.checked(args,args.folderRef,'create','folder');guard();
    const source=await this.editor.snapshot();guard();const name=bpmnName(args.name);
    if(args.dryRun)return{destination:{driveId:ref.driveId,parentItemId:item.id,name},editorSha256:await sha256(new TextEncoder().encode(source.xml))};
    record.phase='writing';record.destination={driveId:ref.driveId,parentItemId:item.id,name};record.sourceSha256=await sha256(new TextEncoder().encode(source.xml));
    let saved;
    try{saved=await this.files.createExclusive({driveId:ref.driveId,id:item.id},name,source.xml,{beforeWrite:guard,onCreated:handle=>{record.created=true;record.phase='created_unverified';record.remote={driveId:handle.driveId,itemId:handle.itemId,parentItemId:item.id,name};}});}
    catch(error){if(error.code==='EXTERNAL_CHANGE'&&!record.created)error.code='NAME_ALREADY_EXISTS';throw error;}
    record.remote=this.complete(saved);record.verified=true;record.phase='verified_unattached';
    const file=this.expose({...saved.handle.metadata,file:{}},ref.driveId,args.scopeRef,args.sessionId,ref.siteId);
    if(!args.attach)return{...record,fileRef:file.fileRef};
    try{guard();}catch(error){if(['REVISION_CONFLICT','FILE_CHANGED'].includes(error.code))return{...record,fileRef:file.fileRef,code:error.code,reconciliationRequired:true,recovery:'read_then_attach',phase:'verified_unattached'};throw error;}
    await this.editor.attach(saved,guard,args.autoSave);record.attached=true;
    this.workspace.rememberFile(saved.handle,{provider:ref.siteId?'sharepoint':'onedrive'});
    return{...record,fileRef:file.fileRef,phase:'completed'};
  }); }
  open(args) { return this.run('open',args,async(record,guard)=>{
    this.scope(args,'autosave');
    const current=guard();
    const {ref,item}=await this.checked(args,args.fileRef,'open','file');guard();
    if(item.eTag!==args.expectedETag)throw problem('EXTERNAL_CHANGE','El archivo cambió desde la selección.');
    let expectedETag=args.expectedETag;
    if(current.dirty){
      if(args.currentPolicy!=='save_current'||!current.target)throw problem('DIRTY_DOCUMENT','Conserva primero el documento actual en un destino autorizado.');
      if(args.dryRun)throw problem('DIRTY_DOCUMENT','El dry-run no guarda el documento actual.');
      await this.editor.saveCurrent(args.expectedRevision,guard);guard();const saved=this.editor.state();
      if(saved.dirty)throw problem('DIRTY_DOCUMENT','El documento actual sigue sin guardar.');
      record.currentSaved=true;record.currentSavedRemote=saved.handle?.remoteInfo?.()||null;
      if(saved.target?.driveId===ref.driveId&&saved.target?.itemId===item.id)expectedETag=saved.handle.etag;
    }
    const source=await this.files.handle(item,ref.driveId).verifiedSource();guard();
    if(source.remote.eTag!==expectedETag)throw problem('EXTERNAL_CHANGE','El archivo cambió durante la apertura.');
    this.complete(source);await this.editor.validateSource(source.xml);guard();
    if(args.dryRun)return{remote:source.remote};
    record.remote=source.remote;record.verified=true;record.phase='attaching';
    await this.editor.open(source,guard,args.autoSave);record.attached=true;
    this.workspace.rememberFile(source.handle,{provider:ref.siteId?'sharepoint':'onedrive'});
    return{...record,phase:'completed'};
  }); }
  attach(args) { return this.run('attach',args,async(record,guard)=>{
    this.scope(args,'autosave');
    const {ref,item}=await this.checked(args,args.fileRef,'attach','file');guard();
    if(item.eTag!==args.expectedETag)throw problem('EXTERNAL_CHANGE','El archivo cambió desde la selección.');
    const source=await this.files.handle(item,ref.driveId).verifiedSource();guard();
    const local=await this.editor.snapshot();guard();
    if(source.remote.eTag!==args.expectedETag||source.remote.sha256!==args.expectedRemoteSha256)throw problem('EXTERNAL_CHANGE','La revisión remota ya no coincide.');
    if(source.remote.sha256!==await sha256(new TextEncoder().encode(local.xml)))throw problem('CONTENT_MISMATCH','El archivo remoto difiere del documento actual. No se importó ni sobrescribió.');
    this.complete(source);if(args.dryRun)return{remote:source.remote};
    record.remote=source.remote;record.verified=true;await this.editor.attach(source,guard,args.autoSave);record.attached=true;
    this.workspace.rememberFile(source.handle,{provider:ref.siteId?'sharepoint':'onedrive'});
    for(const previous of this.receipts.values())if(previous.public.phase==='result_unknown'&&previous.identityKey===this.identityKey&&previous.public.destination?.driveId===ref.driveId&&previous.public.destination?.parentItemId===source.remote.parentItemId&&previous.public.destination?.name===source.name&&previous.public.sourceSha256===source.remote.sha256){previous.public.phase='reconciled';previous.public.recovery='explicit_existing_file_attached';previous.public.remote=source.remote;delete previous.public.error;}
    return{...record,phase:'completed'};
  }); }
  autosave(args) { return this.run('autosave',args,async(record,guard)=>{
    const {ref,item}=await this.checked(args,args.fileRef,'autosave','file'),state=guard();
    if(state.target?.driveId!==ref.driveId||state.target?.itemId!==item.id)throw problem('FILE_CHANGED','El destino del autoguardado no coincide con el archivo seleccionado.');
    if(item.eTag!==args.expectedETag)throw problem('EXTERNAL_CHANGE','El destino remoto cambió.');
    if(!args.dryRun)this.editor.enableAutoSave(args.enabled);
    return{attached:true};
  }); }
}
