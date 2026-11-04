'use strict';
(() => {
  function SheetManager(bpmnjs, canvas, commandStack, elementFactory, bpmnFactory, modeling, eventBus, elementRegistry, bpmnReplace, selection, naraER) {
    let importing = true, previousRoot, back = [], goingBack = false;
    const views = new Map();
    // A call path belongs to this editor/document, never to the called process.
    // Keep it separate from the general sheet history (back).
    let calls = [], navigatingCall = false;
    const returnBar = document.getElementById('subprocessReturnBar');
    const returnButton = document.getElementById('subprocessReturn');
    function validCall(call) {
      if (call.document !== definitions() || call.documentId !== window.browserBpmnFiles?.documentId) return false;
      if (canvas.findRoot(call.origin.id) !== call.origin || canvas.findRoot(call.target.id) !== call.target) return false;
      if (elementRegistry.get(call.activity.id) !== call.activity || canvas.findRoot(call.activity) !== call.origin) return false;
      if (call.type === 'bpmn:SubProcess') return call.activity.type === call.type && call.activity.collapsed && call.target.businessObject === call.activity.businessObject;
      return call.activity.type === call.type && call.activity.businessObject.calledElement === call.calledElement && list().some(s => s.id === call.target.id && s.processId === call.calledElement);
    }
    function renderReturn() {
      if (navigatingCall) return;
      if (calls.some(call => !validCall(call)) || naraER.active() || (calls.length && calls.at(-1).target !== canvas.getRootElement())) calls = [];
      const call = calls.at(-1), visible = !!call;
      if (call) {
        const name = list().find(s => s.id === call.origin.id)?.name || call.origin.id;
        returnButton.textContent = '← Volver a ' + name;
        returnButton.title = 'Volver a ' + name;
        returnButton.setAttribute('aria-label', 'Volver a ' + name);
      }
      if (returnBar.hidden === visible) {
        returnBar.hidden = !visible;
        document.getElementById('canvas').classList.toggle('has-call-return', visible);
        canvas.resized();
      }
    }
    let dialogTarget = null;
    let pasteIds=null;
    eventBus.on('copyPaste.pasteElement',500,({descriptor})=>{if(pasteIds&&descriptor.businessObject){if(descriptor.type==='bpmn:Group'&&descriptor.id.startsWith(window.NaraStagePrefix?.()||'Stage_'))descriptor.businessObject.id=(window.NaraStagePrefix?.()||'Stage_')+crypto.randomUUID().replaceAll('-','');pasteIds.set(descriptor.id,descriptor.businessObject.id);}});
    let menuTarget = null;
    const menu = document.createElement('div');
    menu.className = 'sheet-actions-menu'; menu.role = 'menu'; menu.hidden = true;
    const menuActions = [['rename','Cambiar nombre'],['duplicate','Duplicar hoja'],['delete','Eliminar hoja']];
    for (const [action,label] of menuActions) {
      const button = document.createElement('button'); button.type='button'; button.role='menuitem'; button.dataset.action=action; button.textContent=label;
      button.onclick=()=>{const id=menuTarget;closeMenu();try{if(action==='rename')nameDialog(id);else if(action==='duplicate')duplicate(id);else confirmRemove(id);}catch(error){report(error.message);}};
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    function closeMenu(){menu.hidden=true;menuTarget=null;}
    function showMenu(id,anchor){
      menuTarget=id;menu.hidden=false;
      const box=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,box.top-menu.offsetHeight-6)+'px';
      const reason=removeReason(id),button=menu.querySelector('[data-action="delete"]');button.disabled=!!reason;button.title=reason||'Puedes recuperar la hoja con Deshacer';
      menu.querySelector('button').focus();
    }
    document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!e.target.closest('.sheet-menu-trigger'))closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){const id=menuTarget;closeMenu();document.querySelector('[data-sheet="'+CSS.escape(id)+'"]')?.focus();}});
    window.addEventListener('resize',closeMenu);
    const report = message => { document.getElementById('status').textContent = message; };
    const failure = (code, message) => Object.assign(new Error(message), { code });
    const definitions = () => bpmnjs.getDefinitions();
    const processId = root => root.businessObject.$type === 'bpmn:Process' ? root.businessObject.id : root.businessObject.$type === 'bpmn:Collaboration' && root.businessObject.participants?.length === 1 ? root.businessObject.participants[0].processRef?.id : undefined;
    function list() {
      const seen = new Set();
      return [...(definitions()?.diagrams || []).flatMap((diagram, index) => {
        const bo = diagram.plane?.bpmnElement;
        if (!bo || seen.has(bo.id)) return [];
        const root = canvas.findRoot(bo.id + '_plane') || canvas.findRoot(bo.id);
        if (!root) return [];
        seen.add(bo.id);
        const child = bo.$type === 'bpmn:SubProcess';
        return [{ id: root.id, elementId: bo.id, name: bo.name || (index === 0 ? 'Proceso principal' : child ? 'Subproceso' : 'Proceso ' + (index + 1)), kind: child ? 'subprocess' : 'process', processId: processId(root) }];
      }),...naraER.list()];
    }
    function canNavigate() {
      if (window.NaraPropertyDraftPending?.()) throw failure('FORM_PENDING', 'Aplica o descarta el texto pendiente en Propiedades antes de cambiar de hoja.');
    }
    function render() {
      const nav = document.getElementById('sheetNavigation');
      nav.replaceChildren();
      const currentId = naraER.active() || canvas.getRootElement()?.id;
      for (const sheet of list()) {
        const tab = document.createElement('div');tab.className='sheet-tab';tab.classList.toggle('active',currentId===sheet.id);
        const button = document.createElement('button');
        button.type = 'button'; button.role = 'tab'; button.dataset.sheet = sheet.id;
        button.textContent = (sheet.kind === 'subprocess' ? '↳ ' : sheet.kind === 'erd' ? '▤ ' : '') + sheet.name;
        button.title = sheet.name + ' · doble clic para cambiar el nombre · clic derecho para más opciones';
        button.setAttribute('aria-selected', String(currentId === sheet.id));
        button.classList.toggle('active', currentId === sheet.id);
        button.onclick = () => { try { open(sheet.id); } catch (error) { report(error.message); } };
        button.ondblclick = () => nameDialog(sheet.id);
        const options=document.createElement('button');options.type='button';options.className='sheet-menu-trigger';options.textContent='⋯';options.setAttribute('aria-label','Opciones de la hoja '+sheet.name);options.setAttribute('aria-haspopup','menu');options.onclick=()=>showMenu(sheet.id,options);
        button.oncontextmenu=e=>{e.preventDefault();showMenu(sheet.id,button);};button.onkeydown=e=>{if(e.key==='F10'&&e.shiftKey){e.preventDefault();showMenu(sheet.id,button);}};
        tab.append(button,options);nav.appendChild(tab);
      }
      document.getElementById('sheetBack').disabled = !back.some(exists);
      renderReturn();
    }
    const exists = id => canvas.findRoot(id) || naraER.list().some(sheet => sheet.id === id);
    function changed(id) {
      if (!navigatingCall) calls = [];
      if (!importing && previousRoot && previousRoot !== id && !goingBack) back.push(previousRoot);
      previousRoot=id;render();eventBus.fire('nara.sheet.changed');
    }
    function open(id) {
      canNavigate();
      navigate(id);
      // Even clicking the current tab is an explicit, non-call visit.
      calls = []; renderReturn();
    }
    function navigate(id) {
      if (naraER.list().some(s => s.id === id)) { naraER.open(id); return; }
      const root = canvas.findRoot(id);
      if (!root) throw failure('SHEET_NOT_FOUND', 'La hoja no existe en este archivo.');
      const wasEr=!!naraER.active();
      naraER.close({silent:true});
      if (root === canvas.getRootElement()) { if(wasEr) changed(root.id); return; }
      selection.select([]);
      canvas.setRootElement(root);
      if (views.has(root.id)) canvas.viewbox(views.get(root.id));
      else canvas.zoom('fit-viewport', 'auto');
      report('Hoja: ' + (list().find(s => s.id === id)?.name || id));
    }
    function create(name) {
      canNavigate();
      const context = { name: String(name).trim().slice(0, 120) || 'Nuevo proceso' };
      commandStack.execute('nara.sheet.create', context);
      return context.root;
    }
    function rename(id, name) {
      canNavigate();
      if(naraER.list().some(s=>s.id===id)){naraER.rename(id,String(name).trim().slice(0,120)||'Modelo de datos');return;}
      const root = canvas.findRoot(id);
      if (!root) throw failure('SHEET_NOT_FOUND', 'La hoja no existe.');
      modeling.updateProperties(root, { name: String(name).trim().slice(0, 120) || 'Proceso' });
    }
    function removeReason(id){
      const sheet=list().find(s=>s.id===id);if(!sheet)return 'La hoja no existe.';
      if(sheet.kind==='erd')return '';
      if(sheet.kind==='process'&&list().filter(s=>s.kind==='process').length<=1)return 'Conserva al menos una hoja de proceso en el archivo.';
      const root=canvas.findRoot(id),processes=(root?.businessObject.$type==='bpmn:Collaboration'?(root.businessObject.participants||[]).map(p=>p.processRef?.id):[sheet.processId]).filter(Boolean);
      if((definitions().rootElements||[]).some(e=>e!==root.businessObject&&e.$type==='bpmn:Collaboration'&&e.participants?.some(p=>processes.includes(p.processRef?.id))))return 'Otra hoja usa un proceso de esta colaboración. Retira ese vínculo antes de eliminarla.';
      const calls=elementRegistry.getAll().filter(e=>e.type==='bpmn:CallActivity'&&processes.includes(e.businessObject.calledElement)&&canvas.findRoot(e)!==root);
      return calls.length?'Esta hoja está vinculada desde '+calls.length+' actividad(es). Retira esos vínculos antes de eliminarla.':'';
    }
    function confirmRemove(id){
      const reason=removeReason(id);if(reason)throw failure('SHEET_IN_USE',reason);
      const sheet=list().find(s=>s.id===id);
      if(confirm('¿Eliminar la hoja «'+sheet.name+'» y su contenido?'+(sheet.kind==='subprocess'?' También se elimina su actividad del proceso principal.':'')+' Puedes recuperarla con Deshacer.'))remove(id);
    }
    function remove(id){
      canNavigate();const reason=removeReason(id);if(reason)throw failure('SHEET_IN_USE',reason);
      if(naraER.list().some(s=>s.id===id)){naraER.removeSheet(id);return;}
      const root=canvas.findRoot(id);
      if(root.businessObject.$type==='bpmn:SubProcess'){const owner=elementRegistry.get(root.businessObject.id);if(!owner)throw failure('SHEET_NOT_FOUND','No se encontró la actividad del subproceso.');commandStack.execute('nara.sheet.subprocessDelete',{owner});return;}
      commandStack.execute('nara.sheet.delete',{root});report('Hoja eliminada. Puedes recuperarla con Deshacer.');
    }
    function duplicate(id){
      canNavigate();const sheet=list().find(s=>s.id===id);if(!sheet)throw failure('SHEET_NOT_FOUND','La hoja no existe.');
      const names=new Set(list().map(s=>s.name)),withSuffix=suffix=>sheet.name.slice(0,120-suffix.length)+suffix;let name=withSuffix(' (copia)'),count=2;while(names.has(name))name=withSuffix(' (copia '+(count++)+')');
      if(sheet.kind==='erd')return naraER.duplicateSheet(id,name);
      const source=canvas.findRoot(id),copyPaste=bpmnjs.get('copyPaste'),tree=copyPaste.copy(source.children||[],{clip:false});
      const context={source,name,tree};commandStack.execute('nara.sheet.duplicate',context);return context.root;
    }
    commandStack.registerHandler('nara.sheet.duplicate',function(){
      this.preExecute=c=>{
        const copyPaste=bpmnjs.get('copyPaste'),copy=bpmnjs.get('moddleCopy'),sourceBo=c.source.businessObject;
        create(c.name);let root=canvas.getRootElement();
        const nodes=(c.source.children||[]).filter(e=>!e.waypoints&&!e.labelTarget),xs=nodes.map(e=>e.x),ys=nodes.map(e=>e.y),right=nodes.map(e=>e.x+e.width),bottom=nodes.map(e=>e.y+e.height);
        let pasted;const ids=new Map();pasteIds=ids;
        try{pasted=nodes.length?copyPaste.paste({tree:c.tree,element:root,point:{x:(Math.min(...xs)+Math.max(...right))/2,y:(Math.min(...ys)+Math.max(...bottom))/2},hints:{autoSelect:false,createElementsBehavior:false,autoResize:false}}):[];}finally{pasteIds=null;}
        const previousIds=new Map([...ids].map(([oldId,newId])=>[newId,oldId]));
        for(const element of pasted||[]){
          const previousId=previousIds.get(element.id),previous=previousId&&elementRegistry.get(previousId);
          if(element.type==='bpmn:Group'&&previous?.businessObject.categoryValueRef?.value)modeling.updateLabel(element,previous.businessObject.categoryValueRef.value);
          const bo=element.businessObject,values=bo?.extensionElements?.values;if(!values?.some(v=>v.$type==='nara:ConnectionRouting'))continue;
          const cloned=values.map(value=>{if(value.$type!=='nara:ConnectionRouting')return value;const data=JSON.parse(value.json);if(data.sharedWith){if(ids.has(data.sharedWith))data.sharedWith=ids.get(data.sharedWith);else{delete data.sharedWith;delete data.sharedEnd;delete data.joinPoint;}}return bpmnFactory.create('nara:ConnectionRouting',{json:JSON.stringify(data)});});
          modeling.updateProperties(element,{extensionElements:bpmnFactory.create('bpmn:ExtensionElements',{values:cloned})});
        }
        root=canvas.getRootElement();
        const metadata=copy.copyElement(sourceBo,bpmnFactory.create(sourceBo.$type),['documentation','extensionElements']);
        const processMetadata=sourceBo.$type==='bpmn:Process'&&root.businessObject.$type==='bpmn:Process'?Object.fromEntries(['isExecutable','isClosed','processType'].filter(key=>sourceBo[key]!==undefined).map(key=>[key,sourceBo[key]])):{};
        modeling.updateProperties(root,{name:c.name,...processMetadata,...(metadata.documentation?{documentation:metadata.documentation}:{}),...(metadata.extensionElements?{extensionElements:metadata.extensionElements}:{})});
        c.root=root;c.pasted=pasted;selection.select([]);canvas.zoom('fit-viewport','auto');
      };
      this.execute=this.revert=()=>[];
    });
    commandStack.registerHandler('nara.sheet.delete',function(){
      this.preExecute=c=>{
        const defs=definitions();c.beforeRoots=defs.rootElements.slice();c.beforeDiagrams=defs.diagrams.slice();c.previous=canvas.getRootElement();c.previousEr=naraER.active();
        commandStack.execute('nara.sheet.order',{definitions:defs});
        c.removedObjects=new Set([c.root.businessObject,...(c.root.businessObject.participants||[]).map(p=>p.processRef).filter(Boolean)]);
        open(c.root.id);modeling.removeElements((c.root.children||[]).slice());c.emptyRoot=canvas.getRootElement();
      };
      this.execute=c=>{
        const defs=definitions();if(!c.afterRoots){c.afterRoots=defs.rootElements.filter(e=>!c.removedObjects.has(e)&&e!==c.emptyRoot.businessObject);c.afterDiagrams=defs.diagrams.filter(e=>e.plane!==c.emptyRoot.di);}
        defs.rootElements=c.afterRoots.slice();defs.diagrams=c.afterDiagrams.slice();canvas.removeRootElement(c.emptyRoot);
        const next=list().find(s=>s.id===c.previousEr)||list().find(s=>s.id===c.previous.id)||list().find(s=>s.kind==='process');if(next)open(next.id);return [];
      };
      this.revert=c=>{
        const defs=definitions();canvas.addRootElement(c.emptyRoot);defs.rootElements=c.beforeRoots.slice();defs.diagrams=c.beforeDiagrams.slice();canvas.setRootElement(c.emptyRoot);return [];
      };
    });
    commandStack.registerHandler('nara.sheet.subprocessDelete',function(){
      this.preExecute=c=>{commandStack.execute('nara.sheet.order',{definitions:definitions()});open(canvas.findRoot(c.owner).id);modeling.removeElements([c.owner]);};this.execute=this.revert=()=>[];
    });
    commandStack.registerHandler('nara.sheet.order',function(){
      this.execute=c=>{if(!c.records){c.records=[];const seen=new Set(),visit=owner=>{if(!owner?.$type||seen.has(owner))return;seen.add(owner);for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(owner))){if(key.startsWith('$')||!('value'in descriptor))continue;const value=descriptor.value;if(Array.isArray(value)){c.records.push({owner,key,values:value.slice()});value.forEach(visit);}else visit(value);}};visit(c.definitions);}return[];};
      this.revert=c=>{for(const {owner,key,values}of c.records)owner[key]=values.slice();return[];};
    });
    function openSubprocess(id) {
      canNavigate();
      const element = elementRegistry.get(id);
      if (!element) throw failure('ELEMENT_NOT_FOUND', 'No existe el subproceso.');
      if (naraER.active() || canvas.findRoot(element) !== canvas.getRootElement()) throw failure('WRONG_SHEET', 'Abre la hoja de la actividad antes de abrir su detalle.');
      let root;
      if (element.type === 'bpmn:CallActivity') {
        const target = list().find(sheet => sheet.processId === element.businessObject.calledElement);
        if (!target) throw failure('SHEET_NOT_FOUND', 'El proceso llamado no tiene una hoja en este archivo.');
        root = canvas.findRoot(target.id);
      } else {
        if (element.type !== 'bpmn:SubProcess') throw failure('INVALID_OPERATION', 'Elige un subproceso o una actividad de llamada.');
        // Opening detail must not collapse, resize or move any BPMN element.
        if (!element.collapsed) throw failure('SUBPROCESS_EXPANDED', 'Este subproceso muestra su contenido en el lienzo. Su detalle en otra hoja requiere un subproceso contraído.');
        root = canvas.findRoot(element.businessObject.id + '_plane');
      }
      if (!root) throw failure('SHEET_NOT_FOUND', 'No se encontró el detalle del subproceso.');
      if (root === canvas.getRootElement()) throw failure('RECURSIVE_LINK', 'La actividad llama a la misma hoja que ya está abierta.');
      renderReturn();
      const call = { document: definitions(), documentId: window.browserBpmnFiles?.documentId, origin: canvas.getRootElement(), target: root, activity: element, type: element.type, calledElement: element.businessObject.calledElement, view: { ...canvas.viewbox() } };
      navigatingCall = true;
      try {
        navigate(root.id);
        if (canvas.getRootElement() !== root || naraER.active()) throw failure('SHEET_NOT_FOUND', 'No se pudo abrir la hoja llamada.');
        calls.push(call);
      } finally { navigatingCall = false; renderReturn(); }
    }
    function returnFromCall() {
      canNavigate(); renderReturn();
      const call = calls.at(-1);
      if (!call) return;
      navigatingCall = true;
      try {
        navigate(call.origin.id);
        calls.pop();
      } finally { navigatingCall = false; renderReturn(); }
      // Restore zoom independently of viewport size (normal/expanded canvas).
      const size = canvas.getSize(), view = call.view;
      canvas.viewbox({ x: view.x, y: view.y, width: size.width / view.scale, height: size.height / view.scale });
      selection.select(call.activity);
      const box = canvas.viewbox(), e = call.activity;
      if (e.x < box.x || e.y < box.y || e.x + e.width > box.x + box.width || e.y + e.height > box.y + box.height) canvas.scrollToElement(e, 24);
      const focus = calls.length ? returnButton : canvas.getContainer();
      if (!calls.length) focus.setAttribute('tabindex', '0');
      focus.focus({ preventScroll: true });
      report('Hoja: ' + (list().find(s => s.id === call.origin.id)?.name || call.origin.id));
    }
    returnButton.onclick = () => { try { returnFromCall(); } catch (error) { report(error.message); } };
    // The native drilldown icon must use the same guarded call navigation.
    document.getElementById('canvas').addEventListener('click', event => {
      const button = event.target.closest('.bjs-drilldown');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      try { openSubprocess(button.closest('[data-container-id]')?.dataset.containerId); } catch (error) { report(error.message); }
    }, true);
    function link(elementId, sheetId) {
      canNavigate();
      const element = elementRegistry.get(elementId), target = list().find(s => s.id === sheetId);
      if (!element || !['bpmn:Task','bpmn:SubProcess','bpmn:CallActivity'].includes(element.type)) throw failure('INVALID_OPERATION', 'Elige una tarea o un subproceso.');
      if (!target?.processId) throw failure('INVALID_TARGET', 'Elige una hoja de proceso independiente con un solo proceso.');
      let ancestor = element.businessObject;
      while (ancestor && ancestor.$type !== 'bpmn:Process') ancestor = ancestor.$parent;
      if (ancestor?.id === target.processId) throw failure('RECURSIVE_LINK', 'Elige otra hoja para evitar que el proceso se llame a sí mismo.');
      if (element.type === 'bpmn:SubProcess' && (element.businessObject.flowElements?.length || element.businessObject.artifacts?.length)) throw failure('SUBPROCESS_HAS_CONTENT', 'Este subproceso ya tiene contenido. Abre su detalle; no se reemplazará por otro proceso.');
      const context = { element, processId: target.processId };
      commandStack.execute('nara.sheet.link', context);
      selection.select(context.replacement);
      return context.replacement;
    }
    commandStack.registerHandler('nara.sheet.create', function() {
      this.execute = context => {
        const defs = definitions();
        if (!context.root) {
          const bo = bpmnFactory.create('bpmn:Process', { name: context.name, isExecutable: false });
          context.root = elementFactory.createRoot({ type: 'bpmn:Process', businessObject: bo });
          context.diagram = bpmnFactory.create('bpmndi:BPMNDiagram', { plane: context.root.di });
          context.root.di.$parent = context.diagram;
          context.previous = canvas.getRootElement();
          context.previousEr = naraER.active();
        }
        naraER.close({silent:true});
        context.root.businessObject.$parent = defs; context.diagram.$parent = defs;
        defs.get('rootElements').push(context.root.businessObject);
        defs.get('diagrams').push(context.diagram);
        canvas.addRootElement(context.root); canvas.setRootElement(context.root);
        return [context.root];
      };
      this.postExecute = context => {

      };
      this.revert = context => {
        const defs = definitions();
        canvas.removeRootElement(context.root);
        defs.rootElements.splice(defs.rootElements.indexOf(context.root.businessObject), 1);
        defs.diagrams.splice(defs.diagrams.indexOf(context.diagram), 1);
        canvas.setRootElement(context.previous);
        if(context.previousEr)naraER.open(context.previousEr);
        return [context.root];
      };
    });
    commandStack.registerHandler('nara.sheet.link', function() {
      this.preExecute = context => {
        const old = context.element;
        context.replacement = old.type === 'bpmn:CallActivity' ? old : bpmnReplace.replaceElement(old, { type: 'bpmn:CallActivity' });
        modeling.updateProperties(context.replacement, { calledElement: context.processId });
      };
      this.execute = () => [];
      this.revert = () => [];
    });
    async function importAdditional() {
      importing = true;
      const initial = canvas.getRootElement(), warnings = [];
      try {
        for (const diagram of definitions()?.diagrams || []) {
          const bo = diagram.plane?.bpmnElement;
          if (!bo || canvas.findRoot(bo.id) || canvas.findRoot(bo.id + '_plane')) continue;
          const result = await window.NaraImportBpmnDiagram(bpmnjs, definitions(), diagram);
          warnings.push(...result.warnings);
        }
        canvas.setRootElement(initial);
      } finally { importing = false; previousRoot = initial?.id; back = []; render(); }
      return warnings;
    }
    function nameDialog(id = null, kind = 'bpmn') {
      try { canNavigate(); } catch (error) { report(error.message); return; }
      dialogTarget = id;
      document.getElementById('sheetKindField').hidden=!!id;
      document.getElementById('sheetKind').value=kind;
      document.getElementById('sheetDialogHeading').textContent = id ? 'Cambiar nombre de la hoja' : kind==='erd'?'Nueva hoja de modelo de datos':'Nueva hoja de proceso';
      document.getElementById('saveSheetName').textContent = id ? 'Guardar nombre' : 'Crear hoja';
      const input = document.getElementById('sheetName');
      input.value = id ? list().find(s => s.id === id)?.name || '' : '';
      document.getElementById('sheetDialog').showModal(); input.focus(); input.select();
    }
    document.getElementById('newSheet').onclick = () => nameDialog();
    document.getElementById('modeEr').onclick = () => { const sheet=naraER.list()[0];if(sheet){try{open(sheet.id);}catch(error){report(error.message);}}else nameDialog(null,'erd'); };
    document.getElementById('modeBpmn').onclick = () => {const sheet=list().find(s=>s.kind==='process');if(sheet)try{open(sheet.id);}catch(error){report(error.message);}};
    document.getElementById('closeSheetDialog').onclick = () => document.getElementById('sheetDialog').close();
    document.getElementById('sheetForm').onsubmit = event => {
      event.preventDefault();
      try {
        const name = document.getElementById('sheetName').value;
        if (dialogTarget) rename(dialogTarget, name); else if(document.getElementById('sheetKind').value==='erd')naraER.create(name);else create(name);
        document.getElementById('sheetDialog').close();
      } catch (error) { report(error.message); }
    };
    document.getElementById('sheetBack').onclick = () => {
      let id;
      while ((id = back.pop()) && !exists(id)) { /* Skip removed sheets. */ }
      if (id) { goingBack = true; try { open(id); } catch (error) { back.push(id); report(error.message); } finally { goingBack = false; render(); } }
    };
    document.getElementById('openSubprocess').onclick = () => { try { openSubprocess(selection.get()[0]?.id); } catch (error) { report(error.message); } };
    document.getElementById('linkSubprocess').onclick = () => { try { link(selection.get()[0]?.id, document.getElementById('subprocessTarget').value); } catch (error) { report(error.message); } };
    eventBus.on(['import.parse.start', 'diagram.clear'], () => { importing = true; calls = []; back = []; views.clear(); previousRoot = undefined; renderReturn(); });
    eventBus.on('canvas.viewbox.changed', event => { if (!importing && canvas.getRootElement()) views.set(canvas.getRootElement().id, { ...event.viewbox }); });
    eventBus.on('root.set', event => {
      naraER.close({silent:true});changed(event.element.id);
    });
    eventBus.on('nara.erd.view.changed',()=>changed(naraER.active()||canvas.getRootElement()?.id));
    eventBus.on(['commandStack.changed', 'element.changed'], () => { if (!importing) render(); });
    eventBus.on('root.removed', event => {
      // bpmn-js fires this before removing the root from its registry.
      if (calls.some(call => call.origin === event.element || call.target === event.element)) calls = [];
      if (!importing) renderReturn();
    });
    eventBus.on('element.dblclick', 2000, event => {
      if (!['bpmn:SubProcess','bpmn:CallActivity'].includes(event.element.type)) return;
      try { openSubprocess(event.element.id); } catch (error) { report(error.message); }
      return false;
    });
    this.list = list; this.open = open; this.create = create; this.rename = rename; this.remove=remove;this.duplicate=duplicate;this.link = link; this.openSubprocess = openSubprocess; this.importAdditional = importAdditional; this.nameDialog=nameDialog;
  }
  SheetManager.$inject = ['bpmnjs','canvas','commandStack','elementFactory','bpmnFactory','modeling','eventBus','elementRegistry','bpmnReplace','selection','naraER'];
  window.NaraSheetsModule = { __init__: ['naraSheets'], naraSheets: ['type', SheetManager] };
})();
