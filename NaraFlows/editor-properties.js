'use strict';
(() => {
  const conditionalSources = new Set(['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ComplexGateway']);
  const is = (bo, type) => Boolean(bo?.$instanceOf?.(type) || bo?.$type === type);
  const owner = bo => { for (let p = bo?.$parent; p; p = p.$parent) if (Array.isArray(p.flowElements)) return p; };
  const definitions = bo => { for (let p = bo; p; p = p.$parent) if (is(p, 'bpmn:Definitions')) return p; };
  const canCondition = bo => conditionalSources.has(bo?.$type) || is(bo, 'bpmn:Activity');
  const label = bo => bo.name || bo.id;
  const value = expression => expression?.body || '';
  const referenceTypes = { MessageEventDefinition: ['messageRef', 'Message', 'Mensaje'], SignalEventDefinition: ['signalRef', 'Signal', 'Señal'], ErrorEventDefinition: ['errorRef', 'Error', 'Error'], EscalationEventDefinition: ['escalationRef', 'Escalation', 'Escalación'] };
  const gatewayHelp = {
    'bpmn:ExclusiveGateway': 'Decisión exclusiva: se toma una sola salida cuya condición se cumpla.',
    'bpmn:InclusiveGateway': 'Decisión inclusiva: se toman todas las salidas cuyas condiciones se cumplan.',
    'bpmn:ParallelGateway': 'Compuerta paralela: activa todas las salidas; al reunirlas, espera todas las entradas.',
    'bpmn:EventBasedGateway': 'Compuerta por eventos: continúa por el primer evento que ocurra. Conecta eventos de captura o tareas de recepción.',
    'bpmn:ComplexGateway': 'Compuerta compleja: utiliza una condición de activación.'
  };
  const typeLabels = {
    'replace-with-exclusive-gateway': 'Decisión exclusiva (X)', 'replace-with-inclusive-gateway': 'Decisión inclusiva (O)',
    'replace-with-parallel-gateway': 'Compuerta paralela (+)', 'replace-with-event-based-gateway': 'Compuerta por eventos', 'replace-with-complex-gateway': 'Compuerta compleja',
    'replace-with-link-intermediate-throw': 'Enlace · salida (flecha rellena)', 'replace-with-link-intermediate-catch': 'Enlace · entrada (flecha vacía)',
    'replace-with-task': 'Tarea', 'replace-with-user-task': 'Tarea de usuario', 'replace-with-manual-task': 'Tarea manual',
    'replace-with-service-task': 'Tarea de servicio', 'replace-with-script-task': 'Tarea de script', 'replace-with-send-task': 'Tarea de envío',
    'replace-with-receive-task': 'Tarea de recepción', 'replace-with-business-rule-task': 'Tarea de reglas de negocio'
  };

  const editors = new WeakMap();
  function create(modeler) {
    if (editors.has(modeler)) return editors.get(modeler);
    const modeling = modeler.get('modeling'), factory = modeler.get('bpmnFactory'), stack = modeler.get('commandStack');
    function Transaction() { this.preExecute = context => context.apply(); this.execute = this.revert = () => []; }
    stack.registerHandler('nara.properties.apply', Transaction);
    const outgoingFor = bo => modeler.get('elementRegistry').filter(element => element.type === 'bpmn:SequenceFlow' && element.businessObject.sourceRef === bo).map(element => element.businessObject);
    const expression = (parent, body, language) => {
      const exp = factory.create('bpmn:FormalExpression', { body, ...(language ? { language } : {}) });
      exp.$parent = parent; return exp;
    };
    const update = (element, target, properties) => () => {
      const shape = target.id && modeler.get('elementRegistry').get(target.id);
      if (shape?.businessObject === target) modeling.updateProperties(shape, properties);
      else modeling.updateModdleProperties(element, target, properties);
    };
    const replaceExpression = (element, parent, property, body, language, changes) => {
      const current = parent[property];
      if (value(current) === body && (current?.language || '') === (language || '')) return;
      if (current && body) changes.push(update(element, current, { body, language: language || undefined }));
      else changes.push(update(element, parent, { [property]: body ? expression(parent, body, language) : undefined }));
    };
    function describe(element) {
      const bo = element.businessObject, event = bo.eventDefinitions?.[0], fields = [], notes = [];
      const add = (key, title, current = '', options = {}) => fields.push({ key, title, value: current, ...options });
      if (event?.$type === 'bpmn:LinkEventDefinition') {
        add('linkName', 'Nombre interno del enlace', event.name || '', { required: true, maxLength: 100, help: 'Usa el mismo nombre interno en la salida y la entrada. El nombre visible puede ser diferente.' });
        const peers = (owner(bo)?.flowElements || []).filter(peer => peer !== bo && peer.eventDefinitions?.some(d => d.$type === event.$type && d.name && d.name === event.name));
        const catches = peers.filter(peer => is(peer, 'bpmn:IntermediateCatchEvent'));
        const throws = peers.filter(peer => is(peer, 'bpmn:IntermediateThrowEvent'));
        notes.push(!event.name ? 'Escribe el nombre interno para identificar el par.' : is(bo, 'bpmn:IntermediateThrowEvent') ? (catches.length === 1 ? 'Entrada encontrada: ' + label(catches[0]) : catches.length ? 'Hay varias entradas con este nombre; conserva una sola.' : 'Falta una entrada con este nombre en el mismo proceso o subproceso.') : (throws.length ? 'Salidas encontradas: ' + throws.map(label).join(', ') : 'Falta una salida con este nombre en el mismo proceso o subproceso.'));
      }
      if (event?.$type === 'bpmn:TimerEventDefinition') {
        const kind = ['timeDate', 'timeDuration', 'timeCycle'].find(key => event[key]) || 'timeDuration';
        add('timerKind', 'Tipo de temporizador', kind, { choices: [['timeDuration', 'Duración'], ['timeDate', 'Fecha'], ['timeCycle', 'Repetición']] });
        add('timerValue', 'Valor del temporizador', value(event[kind]), { required: true, help: 'Ejemplos: PT30M (30 minutos), 2026-12-01T08:00:00-06:00 o R3/P1D (3 veces, cada día).' });
      }
      if (event?.$type === 'bpmn:ConditionalEventDefinition') {
        add('eventCondition', 'Condición del evento', value(event.condition), { multiline: true, required: true });
        add('eventLanguage', 'Lenguaje de la condición (opcional)', event.condition?.language || '');
      }
      const reference = referenceTypes[event?.$type?.replace('bpmn:', '')];
      if (reference) {
        const [property, type, title] = reference, roots = definitions(bo)?.rootElements || [];
        add('referenceId', title + ' del evento', event[property]?.id || '', { choices: [['', 'Crear ' + title.toLowerCase()], ...roots.filter(root => root.$type === 'bpmn:' + type).map(root => [root.id, label(root)])] });
        add('referenceName', 'Nombre ' + (['Signal', 'Escalation'].includes(type) ? 'de la nueva ' : 'del nuevo ') + title.toLowerCase(), '', { required: true, when: ['referenceId', ''], help: 'Para reutilizar uno existente, selecciónalo arriba.' });
        if (type === 'Error' || type === 'Escalation') add('referenceCode', 'Código (opcional)', '', { when: ['referenceId', ''] });
      }
      if (is(bo, 'bpmn:BoundaryEvent') && event?.$type !== 'bpmn:CompensateEventDefinition') add('interrupting', 'Interrumpe la actividad', bo.cancelActivity !== false, { checkbox: true });
      if (gatewayHelp[bo.$type]) notes.push(gatewayHelp[bo.$type]);
      if (is(bo, 'bpmn:ComplexGateway')) add('activation', 'Condición de activación', value(bo.activationCondition), { multiline: true });
      const outgoing = outgoingFor(bo);
      if (canCondition(bo) && outgoing.length) {
        add('defaultFlow', 'Salida predeterminada', bo.default?.id || '', { choices: [['', 'Ninguna'], ...outgoing.map(flow => [flow.id, (flow.name || 'Sin nombre') + ' → ' + label(flow.targetRef)])], help: 'Se utiliza cuando ninguna condición se cumple. La salida predeterminada no lleva condición.' });
        for (const flow of outgoing) add('condition:' + flow.id, 'Condición · ' + (flow.name || label(flow.targetRef)), value(flow.conditionExpression), { multiline: true, flowId: flow.id });
      }
      if (is(bo, 'bpmn:SequenceFlow') && canCondition(bo.sourceRef)) {
        add('isDefault', 'Es la salida predeterminada', bo.sourceRef.default === bo, { checkbox: true });
        add('flowCondition', 'Condición de la conexión', value(bo.conditionExpression), { multiline: true });
        add('flowLanguage', 'Lenguaje de la condición (opcional)', bo.conditionExpression?.language || '');
      }
      if (is(bo, 'bpmn:Activity') && !is(bo, 'bpmn:AdHocSubProcess')) {
        const loop = bo.loopCharacteristics;
        const mode = !loop ? 'none' : is(loop, 'bpmn:StandardLoopCharacteristics') ? 'standard' : loop.isSequential ? 'sequential' : 'parallel';
        add('loopMode', 'Repetición de la actividad', mode, { choices: [['none', 'Una ejecución'], ['standard', 'Bucle con condición'], ['sequential', 'Varias instancias secuenciales'], ['parallel', 'Varias instancias paralelas']] });
        add('loopCondition', 'Condición del bucle', value(loop?.loopCondition), { multiline: true, when: ['loopMode', 'standard'] });
        add('loopCardinality', 'Cantidad de instancias (opcional)', value(loop?.loopCardinality), { when: ['loopMode', ['sequential', 'parallel']] });
      }
      if(is(bo,'bpmn:DataObjectReference')||is(bo,'bpmn:DataStoreReference')){
        const [format,use]=(bo.dataState?.name||'').split(' · ');
        const formats=['Documento','Excel','Word','Manual','Datos'],uses=['Referencia','Entrada','Salida','Entrada/Salida'];
        add('documentFormat','Formato del documento',formats.includes(format)?format:'Documento',{choices:formats.map(v=>[v,v])});
        add('documentUse','Uso del documento',uses.includes(use)?use:'Referencia',{choices:uses.map(v=>[v,v]),help:'El formato y el uso no crean otro archivo ni otra asociación.'});
      }
      if (is(bo, 'bpmn:DataObjectReference') && bo.dataObjectRef) add('isCollection', 'Representa una colección', Boolean(bo.dataObjectRef.isCollection), { checkbox: true });
      return { fields, notes, canChangeType: is(bo, 'bpmn:FlowNode') || is(bo, 'bpmn:SequenceFlow') || is(bo, 'bpmn:MessageFlow') || is(bo, 'bpmn:Association') };
    }
    function plan(element, values) {
      const bo = element.businessObject, event = bo.eventDefinitions?.[0], changes = [];
      const initial = Object.fromEntries(describe(element).fields.map(field => [field.key, field.value]));
      const changed = key => Object.hasOwn(values, key) && values[key] !== initial[key];
      const text = key => String(values[key] ?? '').trim();
      if (Object.hasOwn(values, 'linkName')) {
        const name = text('linkName');
        if (!name || name.length > 100) throw Error('Escribe un nombre interno de enlace de 1 a 100 caracteres.');
        if (changed('linkName')) {
          if (is(bo, 'bpmn:IntermediateCatchEvent') && (owner(bo)?.flowElements || []).some(peer => peer !== bo && is(peer, 'bpmn:IntermediateCatchEvent') && peer.eventDefinitions?.some(d => d.$type === 'bpmn:LinkEventDefinition' && d.name === name))) throw Error('Ya existe una entrada con ese nombre interno en este proceso o subproceso.');
          changes.push(update(element, event, { name }));
        }
      }
      if (changed('timerKind') || changed('timerValue')) {
        if (!['timeDate', 'timeDuration', 'timeCycle'].includes(values.timerKind) || !text('timerValue')) throw Error('Selecciona el tipo y escribe el valor del temporizador.');
        changes.push(update(element, event, Object.fromEntries(['timeDate', 'timeDuration', 'timeCycle'].map(key => [key, key === values.timerKind ? expression(event, text('timerValue')) : undefined]))));
      }
      if (changed('eventCondition') || changed('eventLanguage')) {
        if (!text('eventCondition')) throw Error('Escribe la condición del evento.');
        replaceExpression(element, event, 'condition', text('eventCondition'), text('eventLanguage'), changes);
      }
      if (Object.hasOwn(values, 'referenceId') && (changed('referenceId') || changed('referenceName') || changed('referenceCode'))) {
        const [property, type] = referenceTypes[event.$type.replace('bpmn:', '')], defs = definitions(bo);
        let ref = defs.rootElements.find(root => root.id === values.referenceId && root.$type === 'bpmn:' + type);
        if (!values.referenceId) {
          if (!text('referenceName')) throw Error('Escribe el nombre del nuevo elemento del evento.');
          ref = factory.create('bpmn:' + type, { name: text('referenceName'), ...(type === 'Error' ? { errorCode: text('referenceCode') || undefined } : type === 'Escalation' ? { escalationCode: text('referenceCode') || undefined } : {}) });
          ref.$parent = defs;
          changes.push(update(element, defs, { rootElements: [...defs.rootElements, ref] }));
        }
        if (!ref) throw Error('Selecciona un elemento existente de la lista.');
        changes.push(update(element, event, { [property]: ref }));
      }
      if (changed('interrupting')) changes.push(update(element, bo, { cancelActivity: values.interrupting }));
      if (changed('activation')) replaceExpression(element, bo, 'activationCondition', text('activation'), bo.activationCondition?.language, changes);
      if (Object.hasOwn(values, 'defaultFlow')) {
        const outgoing = outgoingFor(bo), target = outgoing.find(flow => flow.id === values.defaultFlow);
        if (values.defaultFlow && !target) throw Error('La salida predeterminada debe pertenecer al elemento seleccionado.');
        if (changed('defaultFlow')) changes.push(update(element, bo, { default: target }));
        for (const flow of outgoing) {
          const key = 'condition:' + flow.id;
          if (flow === target) {
            if (changed('defaultFlow') && flow.conditionExpression) changes.push(update(element, flow, { conditionExpression: undefined }));
          } else if (changed(key)) replaceExpression(element, flow, 'conditionExpression', text(key), flow.conditionExpression?.language, changes);
        }
      }
      if (Object.hasOwn(values, 'isDefault')) {
        const source = bo.sourceRef;
        if (changed('isDefault')) changes.push(update(element, source, { default: values.isDefault ? bo : source.default === bo ? undefined : source.default }));
        if (values.isDefault) {
          if (changed('isDefault') && bo.conditionExpression) changes.push(update(element, bo, { conditionExpression: undefined }));
        } else if (changed('flowCondition') || changed('flowLanguage')) replaceExpression(element, bo, 'conditionExpression', text('flowCondition'), text('flowLanguage'), changes);
      }
      if (changed('loopMode')) {
        if (!['none', 'standard', 'sequential', 'parallel'].includes(values.loopMode)) throw Error('Selecciona una repetición válida.');
        if (is(bo.loopCharacteristics, 'bpmn:MultiInstanceLoopCharacteristics') && ['sequential', 'parallel'].includes(values.loopMode)) {
          changes.push(update(element, bo.loopCharacteristics, { isSequential: values.loopMode === 'sequential' }));
          if (changed('loopCardinality')) replaceExpression(element, bo.loopCharacteristics, 'loopCardinality', text('loopCardinality'), bo.loopCharacteristics.loopCardinality?.language, changes);
          return changes;
        }
        const loop = values.loopMode === 'none' ? undefined : factory.create(values.loopMode === 'standard' ? 'bpmn:StandardLoopCharacteristics' : 'bpmn:MultiInstanceLoopCharacteristics', values.loopMode === 'standard' ? {} : { isSequential: values.loopMode === 'sequential' });
        if (loop) {
          loop.$parent = bo;
          const key = values.loopMode === 'standard' ? 'loopCondition' : 'loopCardinality';
          if (text(key)) loop[key] = expression(loop, text(key));
        }
        changes.push(update(element, bo, { loopCharacteristics: loop }));
      } else if (bo.loopCharacteristics) {
        const key = values.loopMode === 'standard' ? 'loopCondition' : 'loopCardinality';
        if (changed(key)) replaceExpression(element, bo.loopCharacteristics, key, text(key), bo.loopCharacteristics[key]?.language, changes);
      }
      if(changed('documentFormat')||changed('documentUse')){
        if(!['Documento','Excel','Word','Manual','Datos'].includes(values.documentFormat)||!['Referencia','Entrada','Salida','Entrada/Salida'].includes(values.documentUse))throw Error('Selecciona un formato y uso documental válidos.');
        const state=factory.create('bpmn:DataState',{name:values.documentFormat+' · '+values.documentUse});state.$parent=bo;changes.push(update(element,bo,{dataState:state}));
      }
      if (changed('isCollection')) changes.push(update(element, bo.dataObjectRef, { isCollection: values.isCollection }));
      return changes;
    }
    const editor = { describe, plan, transaction: apply => stack.execute('nara.properties.apply', { apply }) };
    editors.set(modeler, editor); return editor;
  }

  function mount(modeler, host, basePending) {
    const editor = create(modeler);
    modeler.get('popupMenu').registerProvider('bpmn-replace', { getPopupMenuEntries: () => entries => Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, typeLabels[key] ? { ...entry, label: typeLabels[key] } : entry])) });
    let current, initial = {}, fields = [], controls = new Map();
    const read = () => Object.fromEntries([...controls].map(([key, control]) => [key, control.type === 'checkbox' ? control.checked : control.value]));
    const matches = (expected, actual) => Array.isArray(expected) ? expected.includes(actual) : expected === actual;
    function visibility() {
      const values = read();
      for (const field of fields) {
        const control = controls.get(field.key), row = control.closest('.semantic-field');
        row.hidden = Boolean(field.when && !matches(field.when[1], values[field.when[0]]));
        const defaultCondition = field.flowId && values.defaultFlow === field.flowId || ['flowCondition', 'flowLanguage'].includes(field.key) && values.isDefault;
        control.disabled = Boolean(defaultCondition);
        control.required = Boolean(field.required && !row.hidden && !control.disabled);
      }
    }
    function render(element) {
      current = element; host.replaceChildren(); controls = new Map(); fields = []; initial = {};
      if (!element) return;
      const description = editor.describe(element); fields = description.fields;
      if (description.canChangeType) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button'; button.textContent = 'Cambiar tipo de elemento';
        button.onclick = () => {
          if (basePending() || pending()) { document.getElementById('status').textContent = 'Aplica los cambios de Propiedades antes de cambiar el tipo.'; return; }
          const rect = button.getBoundingClientRect();
          modeler.get('popupMenu').open(element, 'bpmn-replace', { x: Math.max(8, rect.left - 245), y: Math.min(rect.top, innerHeight - 290) }, { title: 'Tipo de elemento', width: 245, search: true });
        };
        host.appendChild(button);
      }
      for (const field of fields) {
        const row = document.createElement('div'); row.className = 'semantic-field';
        const title = document.createElement('label'); title.textContent = field.title;
        const control = document.createElement(field.choices ? 'select' : field.multiline ? 'textarea' : 'input');
        control.id = 'semantic-' + field.key.replaceAll(':', '-'); title.htmlFor = control.id;
        if (field.checkbox) control.type = 'checkbox';
        if (field.choices) for (const [key, text] of field.choices) control.add(new Option(text, key));
        if (field.multiline) control.rows = 2;
        if (field.maxLength) control.maxLength = field.maxLength;
        if (field.checkbox) { control.checked = field.value; row.classList.add('semantic-checkbox'); } else control.value = field.value;
        row.append(title, control); controls.set(field.key, control);
        if (field.help) { const help = document.createElement('p'); help.className = 'semantic-help'; help.textContent = field.help; row.appendChild(help); }
        host.appendChild(row);
        control.addEventListener('change', visibility);
      }
      for (const note of description.notes) { const text = document.createElement('p'); text.className = 'semantic-help'; text.textContent = note; host.appendChild(text); }
      initial = read(); visibility();
    }
    function pending() { const values = read(); return Object.keys(initial).some(key => initial[key] !== values[key]); }
    return { render, pending, prepare: () => current ? editor.plan(current, read()) : [], transaction: editor.transaction };
  }
  window.NaraBpmnProperties = { create, mount };
})();
