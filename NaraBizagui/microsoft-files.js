// Microsoft Graph storage. MSAL manages authentication; document contents stay in memory.
export const GRAPH = 'https://graph.microsoft.com/v1.0/';
export const FILE_SCOPES = ['User.Read', 'Files.ReadWrite.All'];
export const SITE_SCOPES = ['Sites.Read.All'];
export const MAX_BYTES = 8 * 1024 * 1024;
export const problem = (code, message) => Object.assign(new Error(message), { code });
const id = value => encodeURIComponent(value);
export const microsoftUrl = value => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)(sharepoint\.com|1drv\.com|onedrive\.com|livefilestore\.com|storage\.live\.com)$/.test(url.hostname)) throw problem('INVALID_TARGET', 'La dirección no pertenece a un servicio Microsoft admitido.');
  return url;
};
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function boundedBytes(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.');
  if (!response.body?.getReader) { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.'); return bytes; }
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; length += value.byteLength; if (length > MAX_BYTES) { await reader.cancel(); throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function graphUrl(path) {
  const url = new URL(path, GRAPH);
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw problem('INVALID_TARGET', 'Destino Microsoft no permitido.');
  return url.href;
}
export function bpmnName(value) {
  const name = value.trim();
  if (!name || name.length > 200 || /[\x00-\x1f"*:<>?\\/|]/.test(name) || /[ .]$/.test(name)) throw problem('INVALID_NAME', 'Escribe un nombre de archivo válido, sin rutas.');
  return /\.bpmn$/i.test(name) ? name : name + '.bpmn';
}
export function sharePointPath(value) {
  let url;
  try { url = new URL(value); } catch { throw problem('INVALID_SITE', 'Escribe la dirección HTTPS del sitio de SharePoint.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.sharepoint\.com$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash) throw problem('INVALID_SITE', 'Usa la dirección de un sitio de SharePoint, sin enlaces de uso compartido.');
  const path = url.pathname.replace(/\/$/, '');
  if (path && !/^\/(sites|teams)\/[^/]+$/i.test(path)) throw problem('INVALID_SITE', 'Usa la dirección del sitio, por ejemplo https://empresa.sharepoint.com/sites/Procesos.');
  return `sites/${url.hostname}:${path || '/'}`;
}
export async function boundedText(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.');
  if (!response.body?.getReader) { const text = await response.text(); if (new TextEncoder().encode(text).length > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.'); return text; }
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > MAX_BYTES) { await reader.cancel(); throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export class MicrosoftFiles {
  constructor(auth, fetcher = (...args) => fetch(...args)) { this.auth = auth; this.fetcher = fetcher; }
  accountId() { const account = this.auth.account; if (!account) throw problem('MICROSOFT_CONNECT', 'Conecta tu cuenta Microsoft.'); return account.homeAccountId; }
  assertAccount(expected) { if (this.accountId() !== expected) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Abre de nuevo el archivo con la cuenta correspondiente.'); }
  async request(path, options = {}, scopes = FILE_SCOPES, expected = this.accountId()) {
    const {beforeSend,...fetchOptions}=options;
    this.assertAccount(expected);
    const token = await this.auth.token(scopes, false);
    this.assertAccount(expected);
    beforeSend?.();
    let response;
    try { response = await this.fetcher(graphUrl(path), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', ...fetchOptions, headers: { ...options.headers, Authorization: 'Bearer ' + token } }); }
    catch { throw problem(options.method && options.method !== 'GET' ? 'SAVE_UNCERTAIN' : 'NETWORK_ERROR', 'No se pudo confirmar la respuesta de Microsoft. Conserva tus cambios y vuelve a leer el archivo antes de guardar de nuevo.'); }
    try{this.assertAccount(expected);}catch(error){if(options.method&&options.method!=='GET')throw problem('SAVE_UNCERTAIN','La cuenta cambió tras enviar la escritura. Conserva el documento y reconcilia el destino original.');throw error;}
    if (response.status === 412 || response.status === 409) throw problem('EXTERNAL_CHANGE', 'El archivo cambió en Microsoft o el nombre ya existe. Recarga la revisión actual o guarda con otro nombre.');
    if (response.status === 401) throw problem('MICROSOFT_CONNECT', 'La sesión Microsoft venció. Vuelve a conectar tu cuenta.');
    if (response.status === 403) throw problem('MICROSOFT_PERMISSION', 'Microsoft no autorizó la operación. Comprueba los permisos del archivo y la autorización de tu organización.');
    if (response.status === 429) {
      const retry=response.headers.get('Retry-After');
      const retryAfterMs=retry ? (/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-Date.now()) : 60000;
      throw Object.assign(problem('THROTTLED', 'Microsoft pidió reducir las consultas. Espera un momento y vuelve a intentar.'),{retryAfterMs:Number.isFinite(retryAfterMs)?Math.max(retryAfterMs,1000):60000});
    }
    if (!response.ok) {
      let detail;try{detail=await response.json();}catch{/* A non-JSON error has no Graph diagnostic. */}
      const graphCode=String(detail?.error?.code||'').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100);
      const diagnostic=String(detail?.error?.message||'').replace(/https?:\/\/\S+/g,'[URL]').slice(0,400);
      throw Object.assign(problem(response.status === 404 ? 'FILE_NOT_FOUND' : 'MICROSOFT_ERROR', `Microsoft no pudo completar la operación (${response.status}${graphCode?': '+graphCode:''}).${diagnostic?' '+diagnostic:''}`),{httpStatus:response.status,graphCode});
    }
    return response.status === 204 ? null : response.json();
  }
  async root(driveId) {
    const accountId = this.accountId();
    if (!driveId) driveId = (await this.request('me/drive?$select=id', {}, FILE_SCOPES, accountId)).id;
    const item = await this.request(`drives/${id(driveId)}/root?$select=id,name,folder,webUrl`, {}, FILE_SCOPES, accountId);
    return { ...item, driveId };
  }
  async children(folder, nextLink) {
    return this.request(nextLink || `drives/${id(folder.driveId)}/items/${id(folder.id)}/children?$select=id,name,folder,file,size,eTag,parentReference,webUrl&$top=100`);
  }
  async versions(handle, nextLink=null) {
    if(handle?.store!==this||handle.storageKind!=='microsoft')throw problem('INVALID_TARGET','Selecciona un archivo Microsoft de esta conexión.');
    this.assertAccount(handle.accountId);
    const endpoint=handle.endpoint()+'/versions';
    if(nextLink&&!graphUrl(nextLink).startsWith(graphUrl(endpoint)+'?'))throw problem('INVALID_TARGET','La página de versiones no corresponde a este archivo.');
    return this.request(nextLink||endpoint,{},FILE_SCOPES,handle.accountId);
  }
  async folder(folder) {
    const item = await this.request(`drives/${id(folder.driveId)}/items/${id(folder.id)}?$select=id,name,folder,root,parentReference`);
    if (!item.folder || !item.id || !item.name) throw problem('INVALID_TARGET', 'Microsoft no devolvió una carpeta disponible.');
    return item;
  }
  metadata(driveId, itemId) { return this.request(`drives/${id(driveId)}/${itemId === 'root' ? 'root' : 'items/' + id(itemId)}`); }
  site(siteUrl) { return this.request(sharePointPath(siteUrl) + '?$select=id,displayName,webUrl', {}, SITE_SCOPES); }
  libraries(siteId) { return this.request(`sites/${id(siteId)}/drives?$select=id,name,webUrl&$top=100`, {}, SITE_SCOPES); }
  async shared(sharingUrl) {
    const url = new URL(sharingUrl);
    if (!['onedrive.live.com','1drv.ms'].includes(url.hostname)) microsoftUrl(sharingUrl);
    else if (url.protocol !== 'https:' || url.username || url.password || url.port) throw problem('INVALID_TARGET', 'Enlace Microsoft inválido.');
    const token = 'u!' + btoa(String.fromCharCode(...new TextEncoder().encode(url.href))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
    return this.request(`shares/${token}/driveItem`);
  }
  // Use the existing small-file Graph route, with server-side fail-on-conflict.
  // No check-then-replace or automatic rename fallback is permitted.
  async createExclusive(folder, name, xml, { beforeWrite = () => {}, onCreated = () => {} } = {}) {
    name = bpmnName(name);
    const bytes = new TextEncoder().encode(xml), accountId = this.accountId();
    if (bytes.length > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.');
    beforeWrite();
    let item;
    try { item = await this.request(`drives/${id(folder.driveId)}/items/${id(folder.id)}:/${id(name)}:/content?@microsoft.graph.conflictBehavior=fail`, {method:'PUT',headers:{'Content-Type':'application/xml; charset=utf-8','If-None-Match':'*'},body:xml,beforeSend:beforeWrite},FILE_SCOPES,accountId); }
    catch(error) { if(error.code==='EXTERNAL_CHANGE')error.code='NAME_ALREADY_EXISTS';throw error; }
    const handle = new MicrosoftFileHandle(this,{...item,driveId:folder.driveId},accountId); onCreated(handle);
    this.assertAccount(accountId);
    const source = await handle.verifiedSource();
    if (source.remote.sha256 !== await sha256(bytes)) throw problem('SAVE_NOT_VERIFIED', 'Los bytes remotos difieren del documento enviado.');
    return source;
  }
  async siteDrives(siteUrl, { authorize = false } = {}) {
    const path = sharePointPath(siteUrl);
    const accountId = this.accountId();
    if (authorize) await this.auth.token(SITE_SCOPES, true);
    const site = await this.request(path + '?$select=id,displayName', {}, SITE_SCOPES, accountId);
    return (await this.request(`sites/${id(site.id)}/drives?$select=id,name,webUrl`, {}, SITE_SCOPES, accountId)).value;
  }
  handle(item, driveId) { return new MicrosoftFileHandle(this, { ...item, driveId: driveId || item.driveId || item.parentReference?.driveId }, this.accountId()); }
  async create(folder, name, xml) {
    name = bpmnName(name);
    if (new TextEncoder().encode(xml).length > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.');
    const accountId = this.accountId();
    const item = await this.request(`drives/${id(folder.driveId)}/items/${id(folder.id)}:/${id(name)}:/content?@microsoft.graph.conflictBehavior=fail`, { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml }, FILE_SCOPES, accountId);
    const handle = this.handle(item, folder.driveId);
    try { if (await (await handle.getFile()).text() !== xml) throw problem('SAVE_NOT_VERIFIED', 'Microsoft devolvió un contenido diferente al enviado.'); }
    catch { throw problem('SAVE_UNCERTAIN', `Microsoft recibió ${name}, pero falta verificarlo. Comprueba el archivo antes de repetir el guardado.`); }
    return handle;
  }
}

export class MicrosoftFileHandle {
  constructor(store, item, accountId) {
    if (!item.id || !item.driveId) throw problem('INVALID_TARGET', 'No se identificó el archivo de Microsoft.');
    this.store = store; this.itemId = item.id; this.driveId = item.driveId; this.accountId = accountId; this.name = item.name;
    this.generation=store.auth.generation;
    this.kind = 'file'; this.storageKind = 'microsoft'; this.etag = null; this.cache = null; this.uncertain = false;
  }
  endpoint() { return `drives/${id(this.driveId)}/items/${id(this.itemId)}`; }
  assertCurrent(){this.store.assertAccount(this.accountId);if(this.generation!==this.store.auth.generation)throw problem('ACCOUNT_CHANGED','La generación Microsoft cambió. Reabre el archivo con la cuenta activa.');}
  async queryPermission() { return this.store.auth.account?.homeAccountId === this.accountId ? 'granted' : 'prompt'; }
  async requestPermission() { return this.queryPermission(); }
  async recoveryCopy(xml) {
    this.store.assertAccount(this.accountId);
    if(!this.parent?.id)await this.getFile();
    if(!this.parent?.id)throw problem('INVALID_TARGET','No se pudo localizar la carpeta para conservar la copia de recuperación.');
    const suffix=' - recuperado '+new Date().toISOString().replace(/[:.]/g,'-')+' '+crypto.randomUUID().slice(0,8)+'.bpmn';
    this.store.assertAccount(this.accountId);
    return this.store.create({driveId:this.driveId,id:this.parent.id},this.name.replace(/\.bpmn$/i,'').slice(0,200-suffix.length)+suffix,xml);
  }
  async isSameEntry(other) { return other?.storageKind === 'microsoft' && this.accountId === other.accountId && this.driveId === other.driveId && this.itemId === other.itemId; }
  async getFile({ifChangedSince=null}={}) {
    this.assertCurrent();
    // SharePoint may omit the computed download annotation when $select is used.
    const meta = await this.store.request(this.endpoint(), {}, FILE_SCOPES, this.accountId);
    this.assertCurrent();
    if (!meta.eTag || !meta.file) throw problem('INVALID_TARGET', 'Microsoft no devolvió un archivo con revisión.');
    if (meta.size > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.');
    if (ifChangedSince && ifChangedSince === meta.eTag) return null;
    if (this.cache === null || this.etag !== meta.eTag) {
      if (!meta['@microsoft.graph.downloadUrl']) throw problem('DOWNLOAD_UNAVAILABLE', 'Microsoft no devolvió un enlace de descarga. Vuelve a abrir el archivo.');
      const url = microsoftUrl(meta['@microsoft.graph.downloadUrl']);
      // Preauthenticated download URLs must never receive a Graph bearer token.
      const response = await this.store.fetcher(url.href, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw problem('DOWNLOAD_ERROR', 'No se pudo descargar el BPMN de Microsoft.');
      const bytes = await boundedBytes(response);
      if (bytes.length !== meta.size) throw problem('SAVE_NOT_VERIFIED', 'El tamaño descargado no coincide con Microsoft.');
      let text;try{text=new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw problem('INVALID_ENCODING','El BPMN no contiene texto UTF-8 válido.');}
      this.assertCurrent();
      const after = await this.store.request(this.endpoint(), {}, FILE_SCOPES, this.accountId);
      this.assertCurrent();
      if (after.eTag !== meta.eTag || after.id !== meta.id || after.size !== meta.size) throw problem('EXTERNAL_CHANGE', 'El archivo cambió durante la descarga. Conserva el documento actual.');
      this.verified = {sha256:await sha256(bytes),eTag:meta.eTag,size:bytes.length,verifiedAt:new Date().toISOString()};
      this.cache = text;
    }
    this.etag = meta.eTag; this.name = meta.name;
    this.metadata = meta;
    this.parent = meta.parentReference ? { ...meta.parentReference } : null;
    const snapshot = this.cache;
    return { name: meta.name, size: meta.size, text: async () => snapshot };
  }
  remoteInfo() {
    const meta = this.metadata, proof = this.verified;
    if (!meta || !proof || proof.eTag !== this.etag) return null;
    return {driveId:this.driveId,itemId:this.itemId,parentItemId:meta.parentReference?.id||null,siteId:meta.parentReference?.siteId||null,name:this.name,webUrl:meta.webUrl||null,...proof};
  }
  async verifiedSource() {
    // Force an actual byte download when explicitly verifying a file operation.
    this.cache = null;
    const file = await this.getFile();
    return {handle:this,name:file.name,xml:await file.text(),remote:this.remoteInfo()};
  }
  async createWritable() {
    this.assertCurrent();
    if (this.uncertain) throw problem('SAVE_UNCERTAIN', 'Hay un guardado sin confirmar. Recarga el archivo de Microsoft antes de volver a guardar.');
    const expected = this.etag;
    if (!expected) throw problem('NO_BASE_REVISION', 'Vuelve a abrir el archivo antes de guardar.');
    let content, aborted = false;
    return {
      write: async xml => { if (aborted) throw problem('ABORTED', 'Guardado cancelado.'); if (typeof xml !== 'string' || new TextEncoder().encode(xml).length > MAX_BYTES) throw problem('FILE_TOO_LARGE', 'El BPMN supera 8 MB.'); content = xml; },
      abort: async () => { aborted = true; content = undefined; },
      close: async () => {
        if (aborted || content === undefined) throw problem('ABORTED', 'No hay contenido para guardar.');
        try {
          await this.store.request(this.endpoint() + '/content', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8', 'If-Match': expected }, body: content,beforeSend:()=>this.assertCurrent() }, FILE_SCOPES, this.accountId);
          this.cache = null;
          if (await (await this.getFile()).text() !== content) throw problem('SAVE_NOT_VERIFIED', 'El archivo de Microsoft no coincide con la revisión enviada.');
        } catch (error) {
          if (!['EXTERNAL_CHANGE', 'MICROSOFT_PERMISSION', 'MICROSOFT_CONNECT', 'THROTTLED'].includes(error.code)) this.uncertain = true;
          throw error;
        }
      }
    };
  }
}
