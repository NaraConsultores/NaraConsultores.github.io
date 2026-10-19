'use strict';
(() => {
  function directionalTarget(source,direction,targets,allowed,isActive=()=>true){
    const vertical=['top','bottom'].includes(direction),positive=['right','bottom'].includes(direction),main=vertical?'y':'x',cross=vertical?'x':'y',size=vertical?'height':'width',breadth=vertical?'width':'height';
    const origin=source[main]+(positive?source[size]:0),center=source[cross]+source[breadth]/2;
    return targets.filter(target=>target!==source&&!target.waypoints&&!target.labelTarget&&!['label','bpmn:Lane','bpmn:Group','bpmn:Process','bpmn:Collaboration'].includes(target.type)&&isActive(target))
      .map(target=>({target,gap:positive?target[main]-origin:origin-target[main]-target[size],offset:Math.max(target[cross]-center,center-target[cross]-target[breadth],0)}))
      .filter(({target,gap,offset})=>gap>=0&&gap<=300&&offset<=100&&!source.outgoing?.some(flow=>flow.target===target)&&allowed(source,target))
      .sort((a,b)=>Math.hypot(a.gap,a.offset)-Math.hypot(b.gap,b.offset)||a.target.id.localeCompare(b.target.id))[0]?.target;
  }
  const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
  window.NaraPaletteIcons = Object.freeze({
    Excel: svg('<path d="M9 3h12l6 6v20H9zM21 3v7h6"/><rect x="3" y="11" width="13" height="14" rx="1"/><path d="m6 15 7 7m0-7-7 7M19 15h5m-5 5h5m-5 5h5"/>'),
    Word: svg('<path d="M9 3h12l6 6v20H9zM21 3v7h6"/><rect x="3" y="11" width="13" height="14" rx="1"/><path d="m5 15 2 7 2-5 2 5 2-7m6 0h5m-5 5h5m-5 5h5"/>'),
    Manual: svg('<path d="M16 8C12 5 7 4 3 5v22c4-1 9 0 13 3 4-3 9-4 13-3V5c-4-1-9 0-13 3Zm0 0v22M7 10l5 1m-5 4 5 1m8-5 5-1m-5 6 5-1"/>'),
    Datos: svg('<ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 5 22 5 22 0V7M5 13c0 5 22 5 22 0M5 19c0 5 22 5 22 0"/>'),
    Etapa: svg('<rect x="5" y="3" width="22" height="26" rx="1"/><path d="M5 9h22M12 9v20M20 9v20"/>')
  });

  function DocumentSymbols(eventBus) {
    eventBus.on('render.shape', 1500, (_, context) => {
      const element = context.element;
      if (!['bpmn:DataObjectReference','bpmn:DataStoreReference'].includes(element.type)) return;
      const format = element.businessObject.dataState?.name?.split(' · ')[0];
      if(!['Excel','Word','Manual','Datos'].includes(format))return;
      const markup = window.NaraPaletteIcons[format];
      if (!markup) return;
      // The palette and canvas share the same vector, including drag previews and exports.
      const icon = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      icon.classList.add('document-line-symbol'); icon.dataset.format = format;
      icon.removeAttribute('aria-hidden'); icon.setAttribute('aria-label', format);
      icon.setAttribute('width', element.width); icon.setAttribute('height', element.height);
      const style=window.NaraStylePanel?.read(element)||{};
      icon.setAttribute('stroke', style.stroke||element.di?.stroke||'#345b78');if(style.strokeWidth)icon.setAttribute('stroke-width',style.strokeWidth);icon.setAttribute('pointer-events','none');
      context.gfx.appendChild(icon);
      return icon;
    });
  }
  DocumentSymbols.$inject = ['eventBus'];

  function DirectionTools(contextPad, popupMenu, eventBus, canvas, elementRegistry, elementFactory, modeling, rules, connect, create, dragging, selection,naraVisual) {
    const actions = new WeakMap(), host = document.getElementById('canvas');
    const layer = document.createElement('div');
    layer.className = 'nara-direction-tools'; layer.hidden = true; host.appendChild(layer);
    let current, side = 'right', hideTimer, clickTimer, suppressClickUntil = 0, lastMenuPoint;
    const vectors = { top: [0,-1], right: [1,0], bottom: [0,1], left: [-1,0] };
    const names = { top: 'arriba', right: 'derecha', bottom: 'abajo', left: 'izquierda' };
    const shapes = {
      'append.append-task': ['bpmn:Task', 'Tarea'], 'append.gateway': ['bpmn:ExclusiveGateway', 'Decisión'],
      'append.intermediate-event': ['bpmn:IntermediateThrowEvent', 'Evento intermedio'], 'append.end-event': ['bpmn:EndEvent', 'Fin']
    };
    const labels = {
      'append.append-task': 'Añadir tarea', 'append.end-event': 'Añadir fin', 'append.gateway': 'Añadir decisión',
      'append.intermediate-event': 'Añadir evento intermedio', 'append.text-annotation': 'Añadir comentario',
      replace: 'Cambiar tipo', delete: 'Eliminar', connect: 'Conectar',
      'lane-insert-above': 'Añadir carril arriba', 'lane-insert-below': 'Añadir carril abajo',
      'lane-divide-two': 'Dividir en dos carriles', 'lane-divide-three': 'Dividir en tres carriles'
    };
    const report = error => { document.getElementById('status').textContent = error.message || error; };
    const safe = fn => { try { fn(); } catch (error) { report(error); } };
    const midpoint = el => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
    function hide() { clearTimeout(hideTimer); layer.hidden = true; current = undefined; }
    function deferHide() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!layer.matches(':hover,:focus-within')) hide(); }, 180); }
    function position() {
      if (!current || !elementRegistry.get(current.id)) return hide();
      const graphics = elementRegistry.getGraphics(current), visual = graphics?.querySelector('.djs-visual');
      if (!visual) return hide();
      const box = visual.getBoundingClientRect(), container = host.getBoundingClientRect();
      Object.assign(layer.style, { left: box.left - container.left + 'px', top: box.top - container.top + 'px', width: box.width + 'px', height: box.height + 'px' });
      const stageOptions=layer.querySelector('.nara-stage-options');
      if(stageOptions){
        const inset=6,clamp=(value,size,max)=>Math.max(inset,Math.min(value,max-size-inset));
        const width=stageOptions.offsetWidth,height=stageOptions.offsetHeight;
        let left=box.right-container.left+7;
        if(left+width>container.width-inset)left=box.left-container.left-width-7;
        left=clamp(left,width,container.width);let top=clamp(box.top-container.top+6,height,container.height);
        if(left<box.right-container.left&&left+width>box.left-container.left){const below=box.top-container.top+36;top=clamp(below+height<=container.height-inset?below:box.top-container.top-height-6,height,container.height);}
        Object.assign(stageOptions.style,{left:left-(box.left-container.left)+'px',top:top-(box.top-container.top)+'px'});
        const more=layer.querySelector('.nara-tools-more'),moreTop=box.top-container.top-29;
        Object.assign(more.style,{left:clamp(box.right-container.left+7,25,container.width)-(box.left-container.left)+'px',top:(moreTop>=inset?moreTop:clamp(top+height+6,24,container.height))-(box.top-container.top)+'px',bottom:'auto'});
        for(const add of layer.querySelectorAll('[data-add-direction]')){
          const x=add.dataset.addDirection==='left'?box.left-container.left-37:box.right-container.left+7;
          const middle=(Math.max(box.top,container.top)+Math.min(box.bottom,container.bottom))/2;
          Object.assign(add.style,{left:clamp(x,30,container.width)-(box.left-container.left)+'px',right:'auto',top:clamp(middle-container.top-15,30,container.height)-(box.top-container.top)+'px'});
        }
      }
    }
    function chooseSide(event) {
      if (!current || current.waypoints || !event) return;
      const rect = layer.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) / Math.max(rect.width, 1);
      const y = (event.clientY - rect.top - rect.height / 2) / Math.max(rect.height, 1);
      setSide(Math.abs(x) >= Math.abs(y) ? x >= 0 ? 'right' : 'left' : y >= 0 ? 'bottom' : 'top');
    }
    function setSide(value) { side = value; layer.dataset.side = value; }
    function docking(source, direction) {
      const v = vectors[direction], middle = midpoint(source);
      return { x: middle.x + v[0] * source.width / 2, y: middle.y + v[1] * source.height / 2 };
    }
    function nearest(source, direction) {
      return directionalTarget(source,direction,elementRegistry.getAll(),(source,target)=>rules.allowed('connection.create',{source,target}),target=>canvas.findRoot(target)===canvas.getRootElement());
    }
    function connectExisting(source,target,direction){
      if(window.NaraPropertyDraftPending?.())throw Error('Aplica o descarta el texto pendiente en Propiedades.');
      if(!source.outgoing?.some(flow=>flow.target===target))modeling.connect(source,target,undefined,{connectionStart:docking(source,direction)});
      selection.select(target);hide();
    }
    // A quick-shape drop on a node connects it; empty-space drops stay native.
    const existingDrop=event=>{
      const c=event.context,target=(event.hover||c.target)?.labelTarget||(event.hover||c.target);
      return c.naraQuickDirection&&target&&target!==c.source&&!target.waypoints&&rules.allowed('connection.create',{source:c.source,target})?target:null;
    };
    eventBus.on(['create.move','create.hover'],750,event=>{
      const target=existingDrop(event);if(!target)return;
      event.context.target=target;event.context.canExecute=true;
      for(const marker of ['drop-not-ok','attach-ok','new-parent'])canvas.removeMarker(target,marker);
      canvas.addMarker(target,'drop-ok');
    });
    eventBus.on('create.end',1500,event=>{
      const target=existingDrop(event);if(!target)return;
      canvas.removeMarker(target,'drop-ok');safe(()=>connectExisting(event.context.source,target,event.context.naraQuickDirection));return true;
    });
    function append(source, id, direction, preferExisting) {
      if (window.NaraPropertyDraftPending?.()) return report('Aplica o descarta el texto pendiente en Propiedades.');
      const target = preferExisting && nearest(source, direction);
      if (target) {
        connectExisting(source,target,direction);return;
      }
      const shape = elementFactory.createShape({ type: shapes[id][0] }), v = vectors[direction], center = midpoint(source);
      const distance = (v[0] ? (source.width + shape.width) / 2 : (source.height + shape.height) / 2) + 65;
      const point = { x: center.x + v[0] * distance, y: center.y + v[1] * distance };
      const allowed = rules.allowed('shape.append', { source, shape, target: source.parent, position: point });
      if (allowed === false) return report('No se puede añadir ese elemento en esta posición.');
      const added = modeling.appendShape(source, shape, point, source.parent);
      selection.select(added); hide();
    }
    // Wait for a small movement before starting a native drag. A double click can
    // then reuse a nearby BPMN node without creating two accidental shapes.
    function gesture(button, start, click, doubleClick,waitForDouble=true) {
      button.addEventListener('mousedown', down => {
        if (down.button !== 0) return;
        down.preventDefault(); down.stopPropagation();
        const move = event => {
          if (Math.hypot(event.clientX-down.clientX,event.clientY-down.clientY) < 5) return;
          cleanup(); clearTimeout(clickTimer); suppressClickUntil = Date.now() + 500;
          safe(() => start(down)); hide();
        };
        const cleanup = () => { document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', cleanup, true); };
        document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', cleanup, true);
      });
      button.onclick = event => {
        event.stopPropagation(); if (Date.now() < suppressClickUntil) return;
        clearTimeout(clickTimer);if(waitForDouble)clickTimer = setTimeout(() => safe(() => click(event)), 260);else safe(()=>click(event));
      };
      button.ondblclick = event => { event.preventDefault(); event.stopPropagation(); clearTimeout(clickTimer); safe(() => doubleClick(event)); };
    }
    function button(label, className, content) {
      const el = document.createElement('button'); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label); el.className = className;
      if (content) el.textContent = content;
      return el;
    }
    function menu(element, name, anchor) {
      if (name === 'bpmn-replace' && window.NaraPropertyDraftPending?.()) return report('Aplica los cambios de Propiedades antes de cambiar el tipo.');
      selection.select(element);
      const box = anchor?.getBoundingClientRect();
      const width=230;
      if (box?.width) lastMenuPoint = { x: Math.max(8,Math.min(box.right + 6, innerWidth - width - 8)), y: Math.max(8,Math.min(box.top, innerHeight - 280)) };
      popupMenu.open(element, name, lastMenuPoint || { x: 250, y: 250 }, { title: name === 'bpmn-replace' ? 'Tipo de elemento' : 'Más acciones', width, search: false });
    }
    function show(element, original) {
      if(element.labelTarget?.type==='bpmn:Group'&&element.labelTarget.id.startsWith(window.NaraStagePrefix?.()||'Stage_'))element=element.labelTarget;
      if (dragging.context() || element.type === 'label' || !element.parent) return;
      clearTimeout(hideTimer);
      if (current === element && !layer.hidden) { chooseSide(original); return; }
      contextPad.getEntries(element); // Native provider determines the legal actions.
      const entries = actions.get(element) || {};
      if (!Object.keys(entries).length) return hide();
      current = element; layer.replaceChildren(); layer.dataset.element = element.id;
      layer.classList.toggle('connection-tools', !!element.waypoints);
      if (element.waypoints) {
        const panel = document.createElement('div'); panel.className = 'nara-quick-options';
        const coincident=elementRegistry.getAll().filter(other=>other!==element&&other.waypoints&&(other.source===element.source||other.target===element.target)&&window.NaraModelAudit.segments(element).some(([a,b])=>window.NaraModelAudit.segments(other).some(([c,d])=>window.NaraModelAudit.segmentContact(a,b,c,d)?.type==='overlap')));
        if(coincident.length){
          const choice=document.createElement('select');choice.className='nara-connection-choice';choice.setAttribute('aria-label','Seleccionar conexión del tramo compartido');choice.title='Cada conexión conserva su origen y destino';
          for(const connection of [element,...coincident]){const option=document.createElement('option');option.value=connection.id;option.textContent=(connection.source.businessObject.name||connection.source.id)+' → '+(connection.target.businessObject.name||connection.target.id);choice.appendChild(option);}
          choice.onchange=()=>{const chosen=elementRegistry.get(choice.value);selection.select(chosen);show(chosen);};panel.appendChild(choice);
        }
        const straight = button('Recorrido sencillo sin diagonales', 'nara-line-direct', '─');
        straight.onclick = () => safe(() => { naraVisual.orthogonal(element,{preserveSides:true}); hide(); });
        const elbow = button('Línea en ángulo', 'nara-line-elbow', '┐');
        elbow.onclick = () => safe(() => { naraVisual.orthogonal(element,{preserveSides:true}); hide(); });
        const recalculate=button('Recalcular solo esta conexión con lados automáticos','nara-route-recalculate','↻');
        recalculate.onclick=()=>safe(()=>{naraVisual.orthogonal(element,{sourceSide:'auto',targetSide:'auto',sourceOffset:.5,targetOffset:.5});hide();});
        const type = button('Cambiar tipo de conexión', 'bpmn-icon-connection-multi');
        type.onclick = () => safe(() => menu(element,'bpmn-replace',type));
        const anchors=button('Elegir lados de conexión','nara-anchor-button','⊥'),options=document.createElement('div');options.className='nara-anchor-options';options.hidden=true;
        const selectors={};
        for(const [end,title]of [['source','Salida'],['target','Entrada']]){
          const label=document.createElement('label');label.textContent=title;const select=document.createElement('select');select.setAttribute('aria-label',title+' de la conexión');
          for(const [value,text]of [['auto','Automático'],['top','Arriba'],['right','Derecha'],['bottom','Abajo'],['left','Izquierda']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option);}
          const routing=naraVisual.readRouting(element),owner=end==='source'?element.source:element.target,point=end==='source'?element.waypoints[0]:element.waypoints.at(-1);select.value=window.NaraModelAudit.anchorPolicy(routing,end)==='auto'?'auto':routing?.[end]?.side||window.NaraModelAudit.inferAnchor(owner,point).side;
          select.onchange=()=>safe(()=>{naraVisual.orthogonal(element,{sourceSide:selectors.source.value,targetSide:selectors.target.value});position();});selectors[end]=select;label.appendChild(select);options.appendChild(label);
        }
        anchors.onclick=()=>{options.hidden=!options.hidden;anchors.setAttribute('aria-expanded',String(!options.hidden));};
        panel.append(straight, elbow, recalculate,anchors,type); layer.append(panel,options);
      } else {
        const stage = element.type === 'bpmn:Group' && element.id.startsWith(window.NaraStagePrefix?.() || 'Stage_');
        const laneActions = ['lane-insert-above','lane-insert-below'].filter(id => entries[id]);
        if (stage || laneActions.length) {
          const vertical = !stage && element.di?.isHorizontal === false;
          const additions = stage ? [
            ['left','Añadir etapa a la izquierda', () => eventBus.fire('nara.stage.insert',{ element, direction: 'left' })],
            ['right','Añadir etapa a la derecha', () => eventBus.fire('nara.stage.insert',{ element, direction: 'right' })]
          ] : laneActions.map(id => {
            const before = id === 'lane-insert-above';
            const direction = vertical ? before ? 'left' : 'right' : before ? 'top' : 'bottom';
            return [direction,'Añadir carril ' + (vertical ? 'a la ' : '') + names[direction], () => selection.select(modeling.addLane(element,direction))];
          });
          for (const [direction,label,action] of additions) {
            const add = button(label,'nara-direction-arrow nara-direction-add nara-arrow-' + direction,'+');
            add.dataset.addDirection = direction;
            add.onclick = event => { event.stopPropagation(); safe(() => { if (window.NaraPropertyDraftPending?.()) throw Error('Aplica o descarta el texto pendiente en Propiedades.'); action(); hide(); }); };
            layer.appendChild(add);
          }
          const split = (stage?['stage-divide-two','stage-divide-three']:['lane-divide-two','lane-divide-three']).filter(id => entries[id]);
          if (split.length) {
            const panel = document.createElement('div'); panel.className = 'nara-quick-options '+(stage?'nara-stage-options':'nara-lane-options');panel.setAttribute('aria-label',stage?'Dividir etapa en columnas':'Dividir participante en carriles');
            for (const id of split) {
              const entry=entries[id],option = button(entry.title,stage?'nara-stage-split-option':entry.className);
              if(stage){const icon=document.createElement('span');icon.className=entry.className+' nara-column-split-icon';icon.setAttribute('aria-hidden','true');option.appendChild(icon);option.dataset.stageSplit=id==='stage-divide-two'?'2':'3';option.disabled=entry.disabled;if(entry.disabled)option.title=entry.title+'. Amplía la etapa a '+Number(option.dataset.stageSplit)*80+' px de ancho.';}
              else option.dataset.laneAction = id;
              option.onclick = event => safe(() => { if (window.NaraPropertyDraftPending?.()) throw Error('Aplica o descarta el texto pendiente en Propiedades.'); entries[id].action.click(event,element); hide(); });
              panel.appendChild(option);
            }
            layer.appendChild(panel);
          }
        }
        const available = Object.keys(shapes).filter(id => entries[id]);
        if (available.length) {
          for (const direction of Object.keys(vectors)) {
            const arrow = button('Conectar hacia ' + names[direction] + ' · clic al objeto cercano o arrastra', 'nara-direction-arrow nara-arrow-' + direction, '➜');
            arrow.dataset.direction = direction;
            arrow.onmouseenter = () => setSide(direction); arrow.onfocus = () => setSide(direction);
            const click=event=>{const target=nearest(element,direction);if(target)connectExisting(element,target,direction);else{connect.start(event,element,docking(element,direction),true);hide();}};
            gesture(arrow, event => connect.start(event, element, docking(element,direction), true), click, ()=>{},false);
            layer.appendChild(arrow);
          }
          const panel = document.createElement('div'); panel.className = 'nara-quick-options'; panel.setAttribute('aria-label','Añadir y conectar');
          for (const id of available) {
            const quick = button(shapes[id][1] + ' · arrastra para colocar; doble clic para conectar cerca', 'nara-quick-shape ' + entries[id].className);
            quick.dataset.append = id;
            const preview = document.createElement('span'); preview.className = 'nara-shape-preview ' + entries[id].className; preview.setAttribute('aria-hidden','true'); quick.appendChild(preview);
            gesture(quick, event => create.start(event, elementFactory.createShape({ type: shapes[id][0] }), { source: element,naraQuickDirection:side }), () => append(element,id,side,false), () => append(element,id,side,true));
            panel.appendChild(quick);
          }
          layer.appendChild(panel);
        }
      }
      if(!element.waypoints&&entries.replace){const type=button('Cambiar tipo de elemento','nara-tools-type bpmn-icon-screw-wrench');type.onclick=()=>safe(()=>menu(element,'bpmn-replace',type));layer.appendChild(type);}
      const more = button('Más acciones del elemento', 'nara-tools-more', '⋯');
      more.onclick = () => safe(() => menu(element,'nara-actions',more)); layer.appendChild(more);
      layer.hidden = false; position(); chooseSide(original);
    }
    this.getContextPadEntries = element => entries => {
      const result = Object.fromEntries(Object.entries(entries).map(([id,entry]) => [id,{ ...entry, title: labels[id] || entry.title }]));
      if(element.type==='bpmn:Group'&&element.id.startsWith(window.NaraStagePrefix?.()||'Stage_'))for(const [count,name]of [[2,'two'],[3,'three']])result['stage-divide-'+name]={
        className:'bpmn-icon-lane-divide-'+name,title:'Dividir en '+count+' columnas iguales',disabled:element.width/count<80,
        action:{click:()=>{if(window.NaraPropertyDraftPending?.())throw Error('Aplica la edición pendiente.');eventBus.fire('nara.stage.split',{element,count});}}
      };
      result.properties = { className: 'bpmn-icon-screw-wrench', title: 'Propiedades', action: { click: () => { selection.select(element); eventBus.fire('nara.properties', { element }); } } };
      if (result.replace) result.replace.action = { click: () => menu(element,'bpmn-replace',layer.querySelector('.nara-tools-more')) };
      if (['bpmn:SubProcess','bpmn:CallActivity'].includes(element.type)) result['nara.openSubprocess'] = { className: 'bpmn-icon-subprocess-collapsed', title: 'Abrir hoja del subproceso', action: { click: () => eventBus.fire('nara.openSubprocess', { element }) } };
      actions.set(element, result); return {};
    };
    this.getPopupMenuEntries = element => {
      const entries = actions.get(element) || {};
      return Object.fromEntries(Object.entries(entries).filter(([id]) => !shapes[id]).map(([id, entry]) => [id, {
        label: entry.title, className: entry.className, disabled:entry.disabled,
        action: event => { popupMenu.close(); entry.action?.click?.(event, element); }
      }]));
    };
    layer.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    layer.addEventListener('mouseleave', deferHide);
    eventBus.on('element.hover', event => show(event.element,event.originalEvent));
    eventBus.on('element.out', deferHide);
    host.addEventListener('mousemove', event => {
      if (event.target.closest('.nara-direction-tools')) return;
      const graphic = event.target.closest('.djs-element');
      if (current && graphic?.dataset.elementId === current.id) chooseSide(event);
    });
    eventBus.on('canvas.viewbox.changed', position);
    eventBus.on(['root.set','drag.init','create.init','connect.init','diagram.clear'], hide);
    eventBus.on('commandStack.changed', hide);
    eventBus.on('diagram.destroy', () => { clearTimeout(hideTimer); clearTimeout(clickTimer); layer.remove(); });
    contextPad.registerProvider(500, this);
    popupMenu.registerProvider('nara-actions', this);
  }
  DirectionTools.$inject = ['contextPad','popupMenu','eventBus','canvas','elementRegistry','elementFactory','modeling','rules','connect','create','dragging','selection','naraVisual'];
  window.NaraConnectionTools={directionalTarget};
  window.NaraEditorTools = { __init__: ['naraDocumentSymbols','naraDirectionTools'], naraDocumentSymbols: ['type',DocumentSymbols], naraDirectionTools: ['type', DirectionTools] };
})();
