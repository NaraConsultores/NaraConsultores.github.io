const screens = [
  ['bandeja', 'Menú y bandeja', '01_menu_y_bandeja.png', 'En Transportista, abra Nueva solicitud.'],
  ['nueva', 'Nueva solicitud', '02_nueva_solicitud.png', 'Anote los datos disponibles de la carga y pulse Preparar correo.'],
  ['correo', 'Enviar correo', '03_proveedores_y_correo.png', 'Elija los proveedores de servicios, revise el mensaje y pulse Enviar solicitud.'],
  ['en-cotizacion', 'En cotización', '04_en_cotizacion.png', 'Gestione las respuestas por correo. Cuando reciba una cotización, pulse Cargar oferta.'],
  ['cargar', 'Cargar oferta', '05_cargar_oferta.png', 'Registre las condiciones recibidas y pulse Guardar oferta.'],
  ['comparar', 'Comparar y elegir', '06_comparar_ofertas.png', 'Compare las opciones y pulse Seleccionar oferta y cerrar solicitud.'],
  ['cerrada', 'Solicitud cerrada', '07_cerrada_pendiente.png', 'La oferta queda pendiente de vínculo. Cuando exista el expediente, pulse Vincular a expediente.'],
  ['vincular', 'Vincular expediente', '08_vincular_expediente.png', 'Busque y elija el expediente. Confirme con Vincular oferta.'],
  ['expediente', 'Ver en General', '09_expediente_vinculado.png', 'En Importaciones → General, compruebe el transportista y la referencia a la solicitud.'],
];

const icons = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/>',
  truck: '<path d="M3 5h12v12H3zM15 9h4l3 4v4h-7M15 13h7"/><circle cx="7" cy="18" r="2" fill="white"/><circle cx="18" cy="18" r="2" fill="white"/>',
  warehouse: '<path d="m3 10 9-6 9 6v10H3zM7 20v-8h10v8M7 16h10"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1m3 0h1m3 0h1M8 15h1m3 0h1m3 0h1M8 18h1m3 0h1m3 0h1"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v3M3 7v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1-2-2M20 12h-5v4h5"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1" fill="white"/><path d="m9 14 2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 1v3l2 2v3l-1 2 2 2 3-1 2 2 3-1 1-2 3-1 2-2-1-3 1-2-1-3-3-1-1-3Z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16m7-11-3 3 3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h15"/>',
  forward: '<path d="m12 5 7 7-7 7M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  link: '<path d="m10 13 4-4m-6 7-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m4 4a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};
const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
const link = (label, target, style = '', symbol = '') => '<a class="btn ' + style + '" href="#' + target + '">' + (symbol ? icon(symbol) : '') + label + '</a>';
const pill = (label, tone = '') => '<span class="pill ' + tone + '">' + label + '</span>';
const textField = (label, value = '', attrs = '') => '<label class="field"><span>' + label + '</span><input value="' + value + '" ' + attrs + '></label>';
const selectField = (label, values) => '<label class="field"><span>' + label + '</span><select>' + values.map(value => '<option>' + value + '</option>').join('') + '</select></label>';
const readField = (label, value, updated = false) => '<div class="field"><span>' + label + '</span><div class="readfield' + (updated ? ' updated' : '') + '">' + value + '</div></div>';
const fact = (label, value) => '<div class="fact"><span>' + label + '</span><strong>' + value + '</strong></div>';
const heading = (title, extra = '') => '<div class="section-head"><h2>' + title + '</h2>' + extra + '</div>';
const notice = (message, success = false) => '<div class="notice' + (success ? ' success' : '') + '">' + icon(success ? 'check' : 'info') + '<div>' + message + '</div></div>';
const table = (headers, rows) => '<div class="table-wrap"><table><thead><tr>' + headers.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
const row = (cells, active = false) => '<tr' + (active ? ' class="highlight"' : '') + '>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';

const requestId = 'CT-2026-0042';
const caseId = 'MARCP26-DEMO-014';
const providers = [
  ['Fletes Horizonte', 'cotizaciones@horizonte.example', 'Pacífico Azul'],
  ['Ruta Centro', 'ventas@rutacentro.example', 'Costa del Pacífico'],
  ['Enlace Marítimo', 'ofertas@enlace.example', 'Océano Global'],
];
const offers = [
  { provider: 0, amount: 'USD 2,450.00', days: '23 días', free: '14 días', route: 'Santos → Cartagena → Corinto', date: '14/11/2026', valid: '21/11/2026', file: 'Horizonte-0042.pdf' },
  { provider: 1, amount: 'USD 2,240.00', days: '32 días', free: '10 días', route: 'Santos → Manzanillo → Corinto', date: '15/11/2026', valid: '20/11/2026', file: 'RutaCentro-0042.pdf' },
  { provider: 2, amount: 'USD 2,680.00', days: '21 días', free: '12 días', route: 'Santos → Cartagena → Corinto', date: '16/11/2026', valid: '22/11/2026', file: 'Enlace-0042.pdf' },
];
let selectedOffer = 0;
let requestedProviders = providers.map(provider => provider[1]);
let requestClosed = false;
let caseLinked = false;
const requestDraft = {
  source: 'Aviso del proveedor',
  supplier: 'Repuestos Andinos',
  cargo: 'Repuestos automotrices. El proveedor informa 12 pallets, 24.50 m³ y 3,200 kg de peso bruto.',
};
const quoteDraft = {
  origin: 'Santos, Brasil',
  destination: 'Corinto, Nicaragua',
  notes: 'Favor cotizar alternativas FCL de 20 pies y LCL e indicar días libres en destino.',
};
const chosen = () => offers[selectedOffer];
const providerName = offer => providers[offer.provider][0];

function sidebar(active) {
  const entries = [
    ['Expedientes','folder', '#expediente'], ['Transportista','truck', '#bandeja'],
    ['Almacén','warehouse'], ['Costeo','calculator'], ['Pagos','wallet'],
    ['Contabilidad','clipboard'], ['Administración','settings'],
  ];
  return '<aside class="sidebar"><div class="brand"><div><img src="logo.png" alt="Casa Pellas"><br><small>Gestión de Compras</small></div><span class="btn quiet brand-toggle">' + icon('panel') + '</span></div><nav class="side-nav" aria-label="Navegación principal">' +
    entries.map(([label, symbol, href]) => {
      const content = icon(symbol) + label;
      const cls = 'side-item' + (label === active ? ' selected' : '');
      return href ? '<a class="' + cls + '" href="' + href + '">' + content + '</a>' : '<span class="' + cls + '">' + content + '</span>';
    }).join('') +
    '</nav><section class="profile"><div class="profile-head"><span class="avatar">IM</span><div><strong>Importaciones</strong><small>Perfil de demostración</small></div></div><small>Rol activo</small><div class="role-input">Importaciones <span>⌄</span></div><small>Mockup · Datos ficticios</small></section></aside>';
}

function pageHeader(title, actions, back = '', area = 'Transportista') {
  return '<header class="top"><div class="title-line">' + (back ? link('Volver', back, 'quiet', 'back') : '') +
    '<div><div class="kicker">Gestión de Compras / ' + area + '</div><h1>' + title + '</h1></div></div><div class="actions">' + actions + '</div></header>';
}

function dialog(title, subtitle, content, footer, back, wide = false) {
  return '<div class="modal-shade"><section class="dialog' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + title + '"><div class="dialog-head"><div><h2>' + title + '</h2><small>' + subtitle +
    '</small></div><a class="btn quiet" aria-label="Cerrar" href="#' + back + '">' + icon('close') + '</a></div><div class="dialog-body">' + content +
    '</div><div class="dialog-foot">' + footer + '</div></section></div>';
}

function inbox() {
  const cases = [
    [requestId, '12/11/2026', 'Repuestos Andinos', 'Casa Pellas', 'Santos → Corinto', 'Marítimo',
      requestClosed ? 'Cerrada' : 'En cotización', requestClosed ? 'green' : '', requestClosed ? providerName(chosen()) : '—',
      requestClosed ? '3' : '0', caseLinked ? caseId : requestClosed ? 'Pendiente de vincular' : '—', requestClosed ? 'cerrada' : 'en-cotizacion'],
    ['CT-2026-0041', '11/11/2026', 'Suministros del Pacífico', 'Casa Pellas', 'Houston → Corinto', 'Marítimo', 'Cerrada', 'green', 'Fletes Horizonte', '3', 'Pendiente de vincular', ''],
    ['CT-2026-0040', '10/11/2026', 'Componentes del Norte', 'Casa Pellas', 'Miami → Managua', 'Aéreo', 'Borrador', 'gray', '—', '—', '—', ''],
    ['CT-2026-0039', '09/11/2026', 'Autopartes del Sur', 'Casa Pellas', 'Callao → Corinto', 'Marítimo', 'Cerrada', 'green', 'Ruta Centro', '2', 'MARCP26-DEMO-011', ''],
  ];
  const requests = cases.map(([id, date, supplier, company, route, mode, status, color, carrier, count, caseLink, target], index) =>
    row([target ? '<a href="#' + target + '">' + id + '</a>' : id, date, supplier, company, route, mode, pill(status, color), carrier, count,
      caseLink === 'Pendiente de vincular' ? pill(caseLink, 'amber') : caseLink, target ? link('Abrir', target) : '—'], index === 0));
  const filters = '<section class="card filter-row">' + textField('Solicitud', '', 'id="buscar-solicitud" placeholder="ID de solicitud"') +
    selectField('Estado', ['Todos','Borrador','En cotización','Cerrada']) +
    selectField('Modalidad', ['Todas','Marítimo','Aéreo','Terrestre']) +
    selectField('Vínculo a expediente', ['Todos','Pendiente de vincular','Vinculada']) + '</section>';
  return {
    header: pageHeader('Transportista', link('Nueva solicitud','nueva','primary','plus')),
    body: '<div class="stack">' + filters + '<section class="card">' + heading('Solicitudes de cotización') +
      table(['Solicitud','Fecha de creación','Proveedor de mercancía','Compañía','Ruta solicitada','Modalidad','Estado','Transportista elegido','Ofertas','Expediente','Acción'], requests) +
      '<div class="pagination"><span>1–4 de 4 solicitudes</span><span>Página 1 de 1</span></div></section></div>',
  };
}

function newRequest() {
  const source = '<label class="field"><span>Origen de la solicitud</span><select id="origen-solicitud">' +
    '<option>Aviso del proveedor</option><option>Consulta de Compras</option></select></label>';
  const supplier = textField('Proveedor de mercancía', '', 'id="proveedor-mercancia" placeholder="Si se conoce"');
  const cargo = '<label class="field"><span>Datos recibidos de la carga</span><textarea id="datos-recibidos" rows="4" ' +
    'placeholder="Pegue o resuma los datos del correo o de la consulta"></textarea>' +
    '<small>Incluya el volumen, tipo de carga, bultos, peso o medidas que le hayan informado.</small></label>';
  return {
    header: pageHeader('Nueva solicitud', link('Cancelar','bandeja') + link('Preparar correo','correo','primary','mail'), 'bandeja'),
    body: '<div class="stack request-form"><section class="card stack">' + heading('Datos de la solicitud') +
      '<div class="fields cols-2">' + source + supplier + '</div>' + cargo + '</section>' +
      notice('La solicitud tiene un ID propio. Puede vincular la oferta seleccionada a un expediente más adelante.') + '</div>',
  };
}

function sendMail() {
  const page = newRequest();
  const recipients = providers.map(([name, email]) =>
    '<label><input class="recipient" type="checkbox"' + (requestedProviders.includes(email) ? ' checked' : '') + ' value="' + email + '"><span><strong>' + name + '</strong><small>' + email + '</small></span></label>').join('');
  const left = '<div class="stack"><div><h3>Proveedores de servicios</h3><small>Catálogo de Administración</small></div>' +
    textField('Buscar proveedor','','id="buscar-proveedor" placeholder="Nombre del proveedor"') +
    '<div class="provider-list">' + recipients + '</div><div><h3>Datos para cotizar</h3><small>Complete los que conozca.</small></div>' +
    '<div class="fields cols-2">' + textField('Procedencia o puerto de despacho','','id="origen-correo"') +
    textField('Destino','','id="destino-correo"') + '</div>' +
    '<label class="field"><span>Notas especiales</span><textarea id="notas"></textarea></label></div>';
  const right = '<div class="mail-box"><h3>Vista previa del correo</h3><dl><dt>Para</dt><dd id="para">' +
    '</dd><dt>Asunto</dt><dd id="preview-asunto"></dd></dl>' +
    '<div class="mail-body"><p>Estimados,</p><p>Por favor, envíennos una cotización para el siguiente embarque.</p>' +
    '<p id="preview-ruta"></p><p id="preview-carga"></p><p id="preview-notas"></p>' +
    '<p>Incluyan flete, ruta, tránsito estimado y validez de tarifa.</p><p>Importaciones · Casa Pellas</p></div></div>';
  page.modal = dialog('Enviar solicitud de cotización','Seleccione los proveedores y revise el mensaje.', '<div class="mail-layout">' + left + right + '</div>',
    link('Volver a la solicitud','nueva') + link('Enviar solicitud','en-cotizacion','primary','mail'), 'nueva', true);
  return page;
}

function detail(state) {
  const closed = state === 'cerrada' || state === 'vincular';
  const compare = state === 'comparar';
  const status = closed ? pill('Cerrada','green') : pill('En cotización');
  const caseReference = caseLinked ? '<a href="#expediente">' + caseId + '</a>' : pill('Pendiente de vincular','amber');
  const banner = '<section class="card factbar">' + fact('Estado',status) + fact('Proveedor de mercancía','<span id="resumen-proveedor"></span>') +
    fact('Compañía','Casa Pellas') + fact('Ruta','<span id="resumen-ruta"></span>') + fact('Modalidad','Marítimo · FCL / LCL') + fact('Expediente', closed ? caseReference : '—') + '</section>';
  const activeOffers = compare || closed;
  const tabLinks = '<div class="tabs"><a class="' + (activeOffers ? '' : 'active') + '" href="#en-cotizacion">Solicitud</a><a class="' + (activeOffers ? 'active' : '') +
    '" href="#comparar">Ofertas' + (activeOffers ? ' (3)' : ' (0)') + '</a></div>';
  const content = closed ? closedOffer() : compare ? compareOffers() : sentRequest();
  const actions = closed
    ? (caseLinked ? link('Ver expediente','expediente','','link') : link('Vincular a expediente','vincular','primary','link'))
    : link('Cargar oferta','cargar','primary','upload');
  return { header: pageHeader('Solicitud ' + requestId, actions,'bandeja'), body: '<div class="stack">' + banner + tabLinks + content + '</div>' };
}

function sentRequest() {
  const records = providers.filter(([,email]) => requestedProviders.includes(email))
    .map(([name,email]) => row([name, email, '12/11/2026 14:06', pill('Enviada')]));
  const recipientsLabel = records.length === 1 ? '1 proveedor de servicios' : records.length + ' proveedores de servicios';
  return '<div class="detail-layout"><div class="stack">' + notice('Solicitud enviada por correo a ' + recipientsLabel + '.',true) +
    '<section class="card">' + heading('Destinatarios') + table(['Proveedor de servicios','Correo de cotización','Fecha de envío','Estado'], records) + '</section></div>' +
    '<section class="card"><div class="section-head"><h3>Datos de la carga</h3></div><p class="request-summary" id="resumen-carga"></p></section></div>';
}

function loadOffer() {
  const page = detail('en-cotizacion');
  const fields = selectField('Proveedor de servicios *',providers.map(item => item[0])) + textField('Naviera','Pacífico Azul') +
    textField('Flete *','2,450.00') + selectField('Moneda *',['USD','NIO']) + textField('Tránsito estimado (días) *','23') +
    textField('Días libres en destino','14') + textField('Ruta *','Santos → Cartagena → Corinto') +
    textField('Válida hasta','21/11/2026') + textField('Próxima salida','18/11/2026');
  page.modal = dialog('Cargar oferta','Cotización recibida por correo · ' + requestId,
    '<div class="stack"><div class="fields cols-3">' + fields + '</div><div class="drop"><strong>Cotización del proveedor</strong><small>Adjunte el archivo recibido por correo.</small>' +
    '<input type="file" accept=".pdf,.xlsx,.docx,.eml" aria-label="Adjuntar cotización"><small>Ejemplo: Horizonte-0042.pdf</small></div>' +
    '<label class="field"><span>Observaciones</span><textarea>Incluye recargos informados por el proveedor.</textarea></label></div>',
    link('Cancelar','en-cotizacion') + link('Guardar oferta','comparar','primary'), 'en-cotizacion');
  return page;
}

function compareOffers() {
  const entries = offers.map((offer, index) =>
    row(['<input type="radio" name="oferta" value="' + index + '" aria-label="Seleccionar oferta de ' + providerName(offer) + '"' + (index === selectedOffer ? ' checked' : '') + '>',
      '<strong>' + providerName(offer) + '</strong>', providers[offer.provider][2], '<span class="number">' + offer.amount + '</span>',
      offer.route, offer.days, offer.free, offer.valid, offer.file], index === selectedOffer));
  return '<section class="card">' + heading('Comparar ofertas') +
    table(['Elegir','Proveedor de servicios','Naviera','Flete','Ruta de tránsito','Tránsito estimado','Días libres','Válida hasta','Cotización'],entries) +
    '<div class="selected-bar"><label class="field" style="width:min(660px,65%)"><span>Motivo de selección</span><input value="Equilibrio entre costo, tránsito y días libres."></label>' +
    link('Seleccionar oferta y cerrar solicitud','cerrada','primary','check') + '</div></section>';
}

function closedOffer() {
  const offer = chosen();
  const message = caseLinked ? 'La oferta seleccionada está vinculada al expediente ' + caseId + '.' : 'La oferta seleccionada está pendiente de vincular a un expediente.';
  return notice('<strong>Solicitud cerrada.</strong> ' + message,true) +
    '<section class="card">' + heading('Oferta seleccionada', caseLinked ? pill('Vinculada','green') : pill('Pendiente de vincular','amber')) +
    '<div class="fields cols-4">' + readField('Proveedor de servicios',providerName(offer)) + readField('Naviera',providers[offer.provider][2]) +
    readField('Flete',offer.amount) + readField('Tránsito estimado',offer.days) + readField('Ruta',offer.route) +
    readField('Días libres en destino',offer.free) + readField('Cotización',offer.file) + readField('Estado de la solicitud','Cerrada') + '</div></section>';
}

function linkCase() {
  const page = detail('vincular');
  const chosenOffer = chosen();
  const selectedCase = row(['<input type="radio" name="expediente" checked aria-label="Seleccionar ' + caseId + '">',
    '<strong>' + caseId + '</strong>', 'Repuestos Andinos', 'Casa Pellas', 'Importaciones'], true);
  const content = '<div class="stack">' + notice('<strong>Oferta seleccionada</strong> · ' + providerName(chosenOffer) + ' · ' + chosenOffer.amount + ' · ' + chosenOffer.days) +
    textField('Buscar expediente',caseId,'id="buscar-expediente"') +
    table(['Elegir','ID de expediente','Proveedor de mercancía','Compañía','Etapa'],[selectedCase]) +
    '<small>El expediente mostrará la referencia de la solicitud y el transportista seleccionado en Importaciones → General.</small></div>';
  page.modal = dialog('Vincular oferta a expediente','Solicitud cerrada · ' + requestId, content,
    link('Cancelar','cerrada') + link('Vincular oferta','expediente','primary','link'), 'cerrada');
  return page;
}

function linkedCase() {
  const offer = chosen();
  const banner = '<section class="card factbar casebar">' + pill('Sin fecha de embarque') +
    fact('Proveedor','Repuestos Andinos') + fact('Compañía','Casa Pellas') + fact('Comprador','Por confirmar') + fact('Importador','Importaciones') +
    fact('Facturas','—') + fact('Documento de embarque','—') + fact('Número OI','—') + fact('Tipo de transporte','Marítimo') + fact('Etapa actual','Importaciones') + '</section>';
  const tabs = '<div class="tabs"><span class="active">Resumen</span><span>Documentos</span><span>Historial</span></div><div class="subtabs">' +
    ['General','Agencia','Servicios','Aranceles','Liberación','Programación'].map((label,index) => '<span' + (index === 0 ? ' class="active"' : '') + '>' + label + '</span>').join('') + '</div>';
  const cargo = '<div class="fields cols-4">' + readField('Cantidad de bultos','12') + readField('Procedencia','Brasil') + readField('Puerto de despacho','Santos') +
    readField('Transportista',providerName(offer),true) + readField('Tipo de carga','FCL') + readField('Tamaño de embarque','20 pies') +
    readField('CBM','24.50') + readField('ID de contenedor','—') + readField('Nacionalizado en','—') + readField('Lugar de nacionalización','—') +
    readField('Declaración','—') + readField('Aleatorio','—') + '</div>';
  const dates = '<div class="fields cols-4">' + ['Mercadería lista','ETD · salida estimada','Embarque','ETA · llegada estimada','Documentos a agencia','Arribo NI','Arribo a almacén fiscal','Liberado aduana']
    .map(label => readField(label,'—')).join('') + '</div>';
  const stageNames = [['Apertura','Listo'],['Compras','Listo'],['Importaciones','En proceso'],['Almacén','Liberación pendiente'],['Costeo','Entrega pendiente'],['Seguimiento','Pendiente']];
  const stages = '<aside class="card stage-card"><h3>Etapas del expediente</h3>' + stageNames.map(([label,status],index) =>
    '<div class="stage"><i class="' + (index < 2 ? 'done' : index === 2 ? 'active' : '') + '">' + (index < 2 ? '✓' : index === 2 ? '●' : '○') +
    '</i><div><strong>' + label + '</strong><span>' + status + '</span></div></div>').join('') + '</aside>';
  const general = '<div class="stack">' + tabs + '<h2>Información general</h2>' + notice('<strong>Oferta de transporte vinculada.</strong> ' +
    '<a href="#cerrada">' + requestId + '</a> · ' + providerName(offer),true) +
    '<section class="card stack"><h3>Información de embarque</h3>' + cargo + '<hr class="section-divider"><h3>Fechas y seguimiento</h3>' + dates + '</section></div>';
  return {header: pageHeader('Expediente ' + caseId,link('Ver oferta seleccionada','cerrada','','link'),'bandeja','Expedientes'),
    body: '<div class="stack">' + banner + '<div class="case-grid">' + general + stages + '</div></div>'};
}

const pages = {
  bandeja: inbox, nueva: newRequest, correo: sendMail,
  'en-cotizacion': () => detail('en-cotizacion'), cargar: loadOffer,
  comparar: () => detail('comparar'), cerrada: () => detail('cerrada'),
  vincular: linkCase, expediente: linkedCase,
};
const app = document.querySelector('#app');
const review = document.querySelector('#recorrido');

function renderGuide(screen) {
  const index = screens.findIndex(([id]) => id === screen);
  const [, label, screenshot, instruction] = screens[index];
  const previous = screens[index - 1];
  const next = screens[index + 1];
  const steps = screens.map(([id, name], step) => '<li><a href="#' + id + '"' +
    (id === screen ? ' aria-current="step"' : '') + '><span class="review-number">' + (step + 1) +
    '</span><span>' + name + '</span></a></li>').join('');
  const previousLink = previous ? link('Anterior', previous[0], '', 'back') : '';
  const nextLink = next ? '<a class="btn primary" href="#' + next[0] + '">Siguiente' + icon('forward') + '</a>'
    : link('Volver al inicio', screens[0][0], '', 'back');

  review.innerHTML = '<div class="review-head"><div><strong>ATLAS · Recorrido de Transportista</strong>' +
    '<small>Propuesta visual · Datos ficticios</small></div><a class="review-image" href="pantallazos/' + screenshot +
    '" target="_blank" rel="noopener">Abrir pantallazo</a></div><ol class="review-steps">' + steps + '</ol>' +
    '<div class="review-current"><div aria-live="polite"><strong>Paso ' + (index + 1) + ' de ' + screens.length +
    ' · ' + label + '</strong><p>' + instruction + '</p></div><div class="review-actions">' + previousLink + nextLink + '</div></div>';

  if (!next || document.body.classList.contains('capture')) return;
  const action = app.querySelector('.shell a.primary[href="#' + next[0] + '"]:not([inert])');
  if (action) {
    action.classList.add('guided-action');
    action.insertAdjacentHTML('afterbegin', '<span aria-hidden="true">→</span>');
  }
}

function updateEmail() {
  const list = [...document.querySelectorAll('.recipient:checked')];
  document.querySelector('#para').innerHTML = list.map(item => item.value).join('<br>') || 'Seleccione al menos un proveedor';
  const route = [quoteDraft.origin, quoteDraft.destination].filter(Boolean).join(' → ');
  document.querySelector('#preview-asunto').textContent = 'Solicitud ' + requestId + (route ? ' · ' + route : '');
  document.querySelector('#preview-ruta').textContent = route ? 'Ruta: ' + route : '';
  document.querySelector('#preview-carga').textContent = requestDraft.cargo;
  document.querySelector('#preview-notas').textContent = quoteDraft.notes;
  const send = document.querySelector('.dialog-foot a.primary');
  send.toggleAttribute('inert', list.length === 0);
  send.setAttribute('aria-disabled', String(list.length === 0));
}

function render() {
  const requested = location.hash.slice(1);
  const screen = Object.hasOwn(pages, requested) ? requested : 'bandeja';
  if (screen === 'cerrada' || screen === 'vincular' || screen === 'expediente') requestClosed = true;
  if (screen === 'expediente') caseLinked = true;
  const page = pages[screen]();
  document.body.classList.toggle('capture',new URLSearchParams(location.search).has('captura'));
  const navigation = sidebar(screen === 'expediente' ? 'Expedientes' : 'Transportista');
  app.innerHTML = '<div class="shell">' + navigation + '<div><div' + (page.modal ? ' inert' : '') + '>' +
    page.header + '<main class="main">' + page.body + '</main></div></div>' + (page.modal || '') + '</div>';
  const [, label, screenshot] = screens.find(([id]) => id === screen);
  app.insertAdjacentHTML('beforeend', '<figure class="mobile-preview"><a href="pantallazos/' + screenshot +
    '" target="_blank" rel="noopener"><img src="pantallazos/' + screenshot + '" alt="' + label + '"></a></figure>');
  renderGuide(screen);
  const initialFields = {
    'origen-solicitud': 'source',
    'proveedor-mercancia': 'supplier',
    'datos-recibidos': 'cargo',
  };
  for (const [id, key] of Object.entries(initialFields)) {
    const field = document.getElementById(id);
    if (!field) continue;
    field.value = requestDraft[key];
    field.addEventListener('input', () => { requestDraft[key] = field.value; });
  }
  const cargoSummary = document.getElementById('resumen-carga');
  if (cargoSummary) cargoSummary.textContent = requestDraft.cargo;
  const supplierSummary = document.getElementById('resumen-proveedor');
  if (supplierSummary) {
    supplierSummary.textContent = requestDraft.supplier || '—';
    const route = [quoteDraft.origin, quoteDraft.destination].filter(Boolean).map(location => location.split(',')[0]);
    document.getElementById('resumen-ruta').textContent = route.join(' → ') || '—';
  }
  if (screen === 'correo') {
    document.querySelectorAll('.recipient').forEach(input => input.addEventListener('change', updateEmail));
    for (const [id, key] of Object.entries({'origen-correo': 'origin', 'destino-correo': 'destination', notas: 'notes'})) {
      const field = document.getElementById(id);
      field.value = quoteDraft[key];
      field.addEventListener('input', () => {
        quoteDraft[key] = field.value;
        updateEmail();
      });
    }
    document.querySelector('.dialog-foot a.primary').addEventListener('click', () => {
      requestedProviders = [...document.querySelectorAll('.recipient:checked')].map(input => input.value);
      caseLinked = false;
      requestClosed = false;
    });
    updateEmail();
    document.querySelector('#buscar-proveedor').addEventListener('input', event => {
      const search = event.target.value.trim().toLocaleLowerCase('es');
      document.querySelectorAll('.provider-list label').forEach(label => {
        label.hidden = !label.textContent.toLocaleLowerCase('es').includes(search);
      });
    });
  }
  if (screen === 'comparar') {
    document.querySelectorAll('input[name="oferta"]').forEach(input => input.addEventListener('change', event => {
      selectedOffer = Number(event.target.value);
      document.querySelectorAll('input[name="oferta"]').forEach(option => option.closest('tr').classList.toggle('highlight',option.checked));
    }));
  }
  if (screen === 'bandeja') {
    document.querySelector('#buscar-solicitud').addEventListener('input', event => {
      const search = event.target.value.trim().toUpperCase();
      document.querySelectorAll('tbody tr').forEach(item => { item.hidden = !item.cells[0].textContent.includes(search); });
    });
  }
  if (screen === 'vincular') {
    document.querySelector('#buscar-expediente').addEventListener('input', event => {
      const found = caseId.includes(event.target.value.trim().toUpperCase());
      document.querySelector('input[name="expediente"]').closest('tr').hidden = !found;
      const action = document.querySelector('.dialog-foot a.primary');
      action.toggleAttribute('inert', !found);
      action.setAttribute('aria-disabled', String(!found));
    });
  }
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',render);
render();
