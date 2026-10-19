'use strict';
(() => {
  const M=window.NaraERModel, NS='http://www.w3.org/2000/svg';
  const $=id=>document.getElementById(id);
  const node=(tag,attrs={},text)=>{const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  function EntityRelationshipEditor(bpmnjs,canvas,commandStack,eventBus,moddle,selection) {
    let activeId=null,selectedId=null,selectedField=null,connectionStart=null,relationMode=false;
    let gesture=null,preview=null,paletteDrag=null,suppressPaletteClickUntil=0,inline=null;
    const views=new Map(),svg=$('erdCanvas');
    const report=message=>{$('status').textContent=message;};
    const safe=action=>{try{return action();}catch(error){report(error.message);const dialog=document.querySelector('.erd-dialog[open]');if(dialog){let note=dialog.querySelector('[data-erd-error]');if(!note){note=document.createElement('p');note.dataset.erdError='true';note.role='status';note.className='erd-error';dialog.appendChild(note);}note.textContent=error.message;}}};
    const defs=()=>bpmnjs.getDefinitions();
    const extensions=()=>defs()?.extensionElements?.values||[];
    const list=()=>extensions().filter(e=>e.$type==='nara:EntityRelationship').map(e=>({id:e.id,elementId:e.id,name:e.name||'Modelo de datos',kind:'erd'}));
    const extension=id=>{const value=extensions().find(e=>e.$type==='nara:EntityRelationship'&&e.id===id);if(!value)throw fail('SHEET_NOT_FOUND','No existe esa hoja de datos.');return value;};
    function read(id=activeId){const value=extension(id);let data;try{data=JSON.parse(value.json);}catch{throw fail('ER_FORMAT','El modelo de datos no se puede leer. Su contenido original se conserva.');}if(value.version&&value.version!=='1'||data?.id!==value.id)throw fail('ER_FORMAT','La versión o identidad del modelo no es compatible. Se conserva su contenido original.');return M.clone(M.validate(data));}
    function pending(){if(!activeId)return false;if(inline)return true;if(!selectedId)return false;const model=read(),entity=model.tables.find(t=>t.id===selectedId),relation=model.relationships.find(r=>r.id===selectedId);if(entity)return $('erdTableName').value!==entity.name||Number($('erdTableWidth').value)!==entity.width;if(relation)return $('erdRelationSource').value!==relation.sourceTableId+'|'+relation.sourceFieldId||$('erdRelationTarget').value!==relation.targetTableId+'|'+relation.targetFieldId||$('erdSourceCardinality').value!==relation.sourceCardinality||$('erdTargetCardinality').value!==relation.targetCardinality||$('erdRelationLabel').value!==(relation.label||'');return false;}
    function setActive(id,silent=false){
      cancelInline();activeId=id;selectedId=null;selectedField=null;connectionStart=null;relationMode=false;preview=null;
      document.body.classList.toggle('erd-active',!!id);svg.toggleAttribute('hidden',!id);
      $('bpmnTools').hidden=!!id;$('erdTools').hidden=!id;
      $('modeBpmn').setAttribute('aria-pressed',String(!id));$('modeEr').setAttribute('aria-pressed',String(!!id));
      $('propertiesPanel').hidden=!!id;$('erdPropertiesPanel').hidden=!id;
      $('diagramKindNote').textContent=id?'Modelo de datos':'Roles × etapas';
      if(id){render();}else{$('erdPropertiesPanel').hidden=true;}
      if(!silent)eventBus.fire('nara.erd.view.changed',{id});
    }
    function open(id){read(id);if(pending())throw fail('FORM_PENDING','Aplica o cierra la edición pendiente antes de cambiar de hoja.');if(activeId===id)return;selection.select([]);setActive(id);}
    function close(options={}){if(activeId)setActive(null,options.silent);}
    commandStack.registerHandler('nara.erd.update',function(){
      const install=(context,value,id)=>{
        defs().extensionElements=value;
        if(value){value.$parent=defs();for(const item of value.values||[])item.$parent=value;}
        setActive(id&&list().some(s=>s.id===id)?id:null,true);
        eventBus.fire('nara.erd.view.changed',{id:activeId});return [];
      };
      this.execute=context=>install(context,context.next,context.nextActive);
      this.revert=context=>install(context,context.previous,context.previousActive);
    });
    function commit(model,{create=false,selectionId}={}){
      M.validate(model);
      const old=extensions();if(!create)extension(model.id);
      const value=moddle.create('nara:EntityRelationship',{id:model.id,name:model.name,version:'1',json:JSON.stringify(model)});
      const next=moddle.create('bpmn:ExtensionElements',{values:create?[...old,value]:old.map(e=>e.id===model.id&&e.$type==='nara:EntityRelationship'?value:e)});
      commandStack.execute('nara.erd.update',{previous:defs().extensionElements,next,previousActive:activeId,nextActive:model.id});
      selectedId=selectionId||null;render();return selectionId;
    }
    function createSheet(name){const model=M.empty(name);commit(model,{create:true});return model.id;}
    function duplicateSheet(id,name){
      const model=M.duplicate(read(id),name);
      commit(model,{create:true});return model.id;
    }
    function removeSheet(id){
      extension(id);if(pending())throw fail('FORM_PENDING','Termina la edición de la celda antes de eliminar una hoja.');
      const values=extensions().filter(e=>e.$type!=='nara:EntityRelationship'||e.id!==id),next=moddle.create('bpmn:ExtensionElements',{values});
      commandStack.execute('nara.erd.update',{previous:defs().extensionElements,next:values.length?next:undefined,previousActive:activeId,nextActive:activeId===id?null:activeId});
    }
    function rename(id,name){const model=read(id);model.name=name.trim();commit(model);}
    function edit(operation){
      if(operation.type==='erd_sheet_create')return createSheet(operation.name);
      if(!activeId)throw fail('WRONG_DIAGRAM_TYPE','Abre una hoja de modelo de datos para editar sus tablas.');
      if(pending())throw fail('FORM_PENDING','Aplica o cierra la edición pendiente del modelo de datos.');
      const result=M.apply(read(),operation),owner=result.model.tables.find(t=>t.fields.some(f=>f.id===result.affectedId));
      commit(result.model,{selectionId:owner?.id||result.affectedId});
      if(owner){selectedField=result.affectedId;render();}
      report('Modelo de datos actualizado. Guarda el archivo para conservarlo.');return result.affectedId;
    }
    function view(){if(!views.has(activeId))views.set(activeId,{x:0,y:0,scale:1});return views.get(activeId);}
    function setView(){if(!activeId)return;const v=view(),r=svg.getBoundingClientRect();svg.setAttribute('viewBox',`${v.x} ${v.y} ${Math.max(r.width,1)/v.scale} ${Math.max(r.height,1)/v.scale}`);positionInline();eventBus.fire('nara.erd.zoom',{scale:v.scale});}
    function fit(){if(!activeId)return;const model=read(),r=svg.getBoundingClientRect();if(!model.tables.length){views.set(activeId,{x:0,y:0,scale:1});setView();return;}const left=Math.min(...model.tables.map(t=>t.x))-75,top=Math.min(...model.tables.map(t=>t.y))-70,right=Math.max(...model.tables.map(t=>t.x+t.width))+85,bottom=Math.max(...model.tables.map(t=>t.y+M.height(t)))+70;views.set(activeId,{x:left,y:top,scale:Math.max(.1,Math.min(1.5,r.width/(right-left),r.height/(bottom-top)))});setView();}
    function zoom(value){if(!activeId)return;if(value==='fit-viewport')return fit();const v=view(),r=svg.getBoundingClientRect(),previous=v.scale;v.scale=Math.max(.1,Math.min(3,value));v.x+=r.width/2/previous-r.width/2/v.scale;v.y+=r.height/2/previous-r.height/2/v.scale;setView();}
    const point=event=>{const r=svg.getBoundingClientRect(),v=view();return{x:v.x+(event.clientX-r.left)/v.scale,y:v.y+(event.clientY-r.top)/v.scale};};
    function endpoints(model,relation){
      const a=M.table(model,relation.sourceTableId),b=M.table(model,relation.targetTableId),right=b.x>=a.x+a.width/2||a.id===b.id;
      const start={x:right?a.x+a.width:a.x,y:a.y+49+a.fields.findIndex(f=>f.id===relation.sourceFieldId)*30};
      const end={x:a.id===b.id||!right?b.x+b.width:b.x,y:b.y+49+b.fields.findIndex(f=>f.id===relation.targetFieldId)*30};
      const mid=a.id===b.id?a.x+a.width+65:(start.x+end.x)/2;
      return {start,end,path:`M${start.x},${start.y} H${mid} V${end.y} H${end.x}`,right};
    }
    function draw(model,{controls=true}={}){
      const group=node('g',{'font-family':'Segoe UI,Arial,sans-serif','font-size':12,fill:'#213e53'});
      const defsEl=node('defs');const marker=node('marker',{id:'naraErArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.appendChild(node('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#4e6b80'}));defsEl.appendChild(marker);group.appendChild(defsEl);
      for(const relation of model.relationships){
        const route=endpoints(model,relation),selected=controls&&selectedId===relation.id,rg=node('g',{'data-relation':relation.id,class:'erd-relationship',role:'button','aria-label':relation.label||'Relación entre campos'});
        const rs=relation.style||{};
        const p=node('path',{d:route.path,fill:'none',stroke:selected?'#0f93ce':rs.stroke||'#4e6b80','stroke-width':rs.strokeWidth||1.5,'marker-end':'url(#naraErArrow)'});rg.appendChild(p);
        if(controls)rg.appendChild(node('path',{d:route.path,fill:'none',stroke:'transparent','stroke-width':14,'pointer-events':'stroke',class:'erd-relation-hit'}));
        rg.appendChild(node('text',{x:route.start.x+(route.right?10:-10),y:route.start.y-7,'text-anchor':route.right?'start':'end','font-size':11},relation.sourceCardinality));
        rg.appendChild(node('text',{x:route.end.x+(route.right?-12:12),y:route.end.y-7,'text-anchor':route.right?'end':'start','font-size':11},relation.targetCardinality));
        if(relation.label){
          const limit=Math.max(10,Math.min(30,Math.floor(Math.abs(route.start.x-route.end.x)/6))),lines=[];
          for(const word of relation.label.split(/\s+/)){if(!lines.length||lines.at(-1).length+word.length+1>limit)lines.push(word);else lines[lines.length-1]+=' '+word;}
          const label=node('text',{x:(route.start.x+route.end.x)/2,y:Math.min(route.start.y,route.end.y)-12-(Math.min(lines.length,3)-1)*13,'text-anchor':'middle',fill:'#667e90','font-size':11,'pointer-events':'none'});
          lines.slice(0,3).forEach((line,index)=>label.appendChild(node('tspan',{x:(route.start.x+route.end.x)/2,dy:index?13:0},line.length>limit?line.slice(0,limit-1)+'…':line)));
          rg.appendChild(node('title',{},relation.label));rg.appendChild(label);
        }
        group.appendChild(rg);
      }
      for(const entity of model.tables){
        const height=M.height(entity),selected=controls&&selectedId===entity.id,s=entity.style||{};
        const g=node('g',{transform:`translate(${entity.x},${entity.y})`,'data-table':entity.id,class:'erd-table'+(selected&&selectedField?' erd-field-selected':''),role:'group','aria-label':entity.name});g.appendChild(node('title',{},entity.name));
        g.setAttribute('fill',s.fontColor||'#213e53');g.setAttribute('font-size',s.fontSize||12);if(s.bold)g.setAttribute('font-weight',600);
        g.appendChild(node('rect',{width:entity.width,height,rx:1,fill:s.fill||'#fff',stroke:selected?'#1097d2':s.stroke||'#55758c','stroke-width':s.strokeWidth||1.2}));
        g.appendChild(node('rect',{width:entity.width,height:34,rx:1,fill:s.fill||'#edf3f7','data-role':'header'}));
        g.appendChild(node('path',{d:`M0 34 H${entity.width} M42 34 V${height-28}`,fill:'none',stroke:'#b6c8d5','stroke-width':1}));
        g.appendChild(node('text',{x:entity.width/2,y:22,'text-anchor':'middle','font-weight':600,'pointer-events':'none','data-cell':'name'},entity.name.length>38?entity.name.slice(0,37)+'…':entity.name));
        for(const [index,f]of entity.fields.entries()){
          const y=34+index*30,selectedRow=controls&&selectedField===f.id;
          const row=node('g',{'data-field':f.id,'data-table':entity.id,class:'erd-field',role:'button','aria-label':f.name+', '+f.dataType+(f.primaryKey?', clave primaria':'')+(f.foreignKey?', clave foránea':'')});
          row.appendChild(node('rect',{y,width:entity.width,height:30,fill:selectedRow?'#e5f3fc':'transparent'}));
          row.appendChild(node('line',{x1:0,x2:entity.width,y1:y+30,y2:y+30,stroke:'#dce5ec','stroke-width':1}));
          row.appendChild(node('rect',{x:0,y,width:42,height:30,fill:'transparent','data-cell':'key'}));
          row.appendChild(node('text',{x:21,y:y+20,'text-anchor':'middle','font-size':f.primaryKey&&f.foreignKey?9:10,'font-weight':600,fill:s.fontColor||'#386480','pointer-events':'none'},[f.primaryKey?'PK':'',f.foreignKey?'FK':''].filter(Boolean).join('/')));
          const maxName=Math.max(9,Math.floor((entity.width-145)/7));
          const align=s.align||'left',nameX=align==='right'?entity.width-100:align==='center'?(entity.width-58)/2:51;
          row.appendChild(node('text',{x:nameX,y:y+20,'text-anchor':align==='right'?'end':align==='center'?'middle':'start','text-decoration':f.primaryKey?'underline':'none','pointer-events':'none'},f.name.length>maxName?f.name.slice(0,maxName-1)+'…':f.name));
          row.appendChild(node('rect',{x:entity.width-95,y,width:95,height:30,fill:'transparent','data-cell':'dataType'}));
          row.appendChild(node('text',{x:entity.width-9,y:y+20,'text-anchor':'end','font-size':10,fill:s.fontColor||'#7b8f9f','pointer-events':'none'},f.dataType.slice(0,15)+(f.nullable?' ?':'')));
          if(controls)for(const side of ['left','right'])row.appendChild(node('circle',{cx:side==='left'?0:entity.width,cy:y+15,r:5,fill:'#fff',stroke:'#20a0d8','stroke-width':1.6,class:'erd-port erd-control','data-port':side,'data-field':f.id,'data-table':entity.id}));
          g.appendChild(row);
        }
        if(controls){g.appendChild(node('rect',{y:height-28,width:entity.width,height:28,fill:'#f8fafc','data-action':'add-field'}));g.appendChild(node('text',{x:14,y:height-10,fill:'#287fae','font-size':11,'data-action':'add-field'},'+ Campo'));
          {const actions=node('g',{class:'erd-row-actions'});for(const [index,[action,label]]of [['field-up','↑'],['field-down','↓'],['field-delete','−']].entries()){actions.appendChild(node('rect',{x:entity.width-90+index*28,y:height-25,width:24,height:22,rx:3,fill:'#e6eff5','data-action':action}));actions.appendChild(node('text',{x:entity.width-78+index*28,y:height-10,'text-anchor':'middle',fill:'#345b78','data-action':action},label));}g.appendChild(actions);}
          if(selected)g.appendChild(node('rect',{x:entity.width-5,y:height-5,width:10,height:10,fill:'#16a0dc',stroke:'#fff',class:'erd-control','data-resize':'true'}));}
        group.appendChild(g);
      }
      return group;
    }
    function select(id,fieldId=null,keepDom=false){
      selectedId=id;selectedField=fieldId;
      if(!keepDom){render();return;}
      for(const group of svg.querySelectorAll('.erd-table')){
        const selected=group.dataset.table===id;group.classList.toggle('erd-field-selected',selected&&!!fieldId);const rect=group.querySelector(':scope > rect');
        rect.setAttribute('stroke',selected?'#1097d2':'#55758c');rect.setAttribute('stroke-width',selected?2:1.2);
        group.querySelector('[data-resize]')?.remove();
        if(selected){const entity=M.table(read(),id);group.appendChild(node('rect',{x:entity.width-5,y:M.height(entity)-5,width:10,height:10,fill:'#16a0dc',stroke:'#fff',class:'erd-control','data-resize':'true'}));}
      }
      for(const row of svg.querySelectorAll('.erd-field'))row.querySelector('rect').setAttribute('fill',row.dataset.field===fieldId?'#e5f3fc':'transparent');
      for(const relation of svg.querySelectorAll('.erd-relationship')){const path=relation.querySelector('path');path.setAttribute('stroke',relation.dataset.relation===id?'#0f93ce':'#4e6b80');path.setAttribute('stroke-width',relation.dataset.relation===id?2.2:1.5);}
      renderProperties();$('delete').disabled=!selectedId;window.NaraStylePanel?.refresh();
    }
    function render(){
      if(!activeId)return;
      if(!list().some(s=>s.id===activeId)){setActive(null);return;}
      const model=preview||read();svg.replaceChildren(draw(model));svg.classList.toggle('erd-connecting',relationMode||!!connectionStart);setView();renderProperties();
      $('delete').disabled=!selectedId;window.NaraStylePanel?.refresh();
    }
    function showProperties(){if(!activeId)return;$('properties').click();}
    function renderProperties(){
      if(!activeId)return;
      const model=read(),entity=model.tables.find(t=>t.id===selectedId),relation=model.relationships.find(r=>r.id===selectedId);
      $('erdEmptySelection').hidden=!!entity||!!relation;$('erdTableProperties').hidden=!entity;$('erdRelationProperties').hidden=!relation;
      if(entity){$('erdTableName').value=entity.name;$('erdTableWidth').value=entity.width;const listEl=$('erdFieldList');listEl.replaceChildren();for(const f of entity.fields){const row=document.createElement('div');row.className='erd-property-field';const label=document.createElement('button');label.type='button';label.textContent=[f.primaryKey?'PK':'',f.foreignKey?'FK':'',f.name,'·',f.dataType].filter(Boolean).join(' ');label.onclick=()=>startInline(entity.id,f.id);row.appendChild(label);listEl.appendChild(row);}}
      window.NaraStylePanel?.refresh();
      if(relation){fillFieldOptions($('erdRelationSource'),relation.sourceTableId+'|'+relation.sourceFieldId);fillFieldOptions($('erdRelationTarget'),relation.targetTableId+'|'+relation.targetFieldId);$('erdSourceCardinality').value=relation.sourceCardinality;$('erdTargetCardinality').value=relation.targetCardinality;$('erdRelationLabel').value=relation.label||'';$('erdRelationSummary').textContent=[M.table(model,relation.sourceTableId).name+'.'+M.field(model,relation.sourceTableId,relation.sourceFieldId).name,relation.sourceCardinality+' → '+relation.targetCardinality,M.table(model,relation.targetTableId).name+'.'+M.field(model,relation.targetTableId,relation.targetFieldId).name].join('  ');}
    }
    function addTable(position){if(!activeId)return;const v=view(),r=svg.getBoundingClientRect();return edit({type:'erd_table_create',x:Math.round(position?.x??v.x+r.width/v.scale/2-150),y:Math.round(position?.y??v.y+r.height/v.scale/2-60)});}
    function cancelInline(){if(inline){const input=inline.input;inline=null;input.remove();}}
    function positionInline(){if(!inline)return;const entity=M.table(read(),inline.tableId),index=entity.fields.findIndex(f=>f.id===inline.fieldId),cell=inline.cell,v=view(),rect=svg.getBoundingClientRect(),host=svg.parentElement.getBoundingClientRect();const x=entity.x+(cell==='name'?0:cell==='key'?0:cell==='dataType'?entity.width-95:43),y=entity.y+(cell==='name'?0:34+index*30),width=cell==='name'?entity.width:cell==='key'?42:cell==='dataType'?95:entity.width-138;Object.assign(inline.input.style,{left:rect.left-host.left+(x-v.x)*v.scale+'px',top:rect.top-host.top+(y-v.y)*v.scale+'px',width:width*v.scale+'px',height:(cell==='name'?34:30)*v.scale+'px',fontSize:Math.max(11,(entity.style?.fontSize||12)*v.scale)+'px'});}
    function startInline(tableId,fieldId,cell='fieldName'){
      if(pending())throw fail('FORM_PENDING','Termina la celda actual con Enter o cancela con Escape.');
      const model=read(),entity=M.table(model,tableId),f=fieldId?M.field(model,tableId,fieldId):null;select(tableId,fieldId);
      const input=document.createElement(cell==='key'?'select':'input');input.className='erd-inline-editor';input.setAttribute('aria-label',cell==='name'?'Nombre de tabla en lienzo':cell==='key'?'Clave del campo en lienzo':cell==='dataType'?'Tipo de dato en lienzo':'Nombre del campo en lienzo');
      if(cell==='key'){for(const [value,label]of [['','—'],['PK','PK'],['FK','FK'],['PK/FK','PK/FK']])input.appendChild(new Option(label,value));input.value=[f.primaryKey?'PK':'',f.foreignKey?'FK':''].filter(Boolean).join('/');}else{input.maxLength=cell==='dataType'?80:120;input.value=cell==='name'?entity.name:cell==='dataType'?f.dataType:f.name;}
      inline={input,tableId,fieldId,cell,snapshot:JSON.stringify(model)};svg.parentElement.appendChild(input);positionInline();input.focus();input.select?.();
      input.onpointerdown=e=>e.stopPropagation();
      input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelInline();render();}else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();e.stopPropagation();const next=e.key==='Tab'&&!e.shiftKey;safe(()=>{finishInline();if(next&&fieldId)startInline(tableId,fieldId,cell==='fieldName'?'dataType':cell==='dataType'?'key':'fieldName');});}};
      input.onblur=()=>{if(inline?.input===input)safe(finishInline);};if(cell==='key')input.onchange=()=>safe(finishInline);
    }
    function finishInline(){
      if(!inline)return;const draft=inline,model=read();if(JSON.stringify(model)!==draft.snapshot)throw Error('El modelo cambió durante la edición. Pulsa Escape para cancelar la celda.');
      const entity=M.table(model,draft.tableId),f=draft.fieldId?M.field(model,draft.tableId,draft.fieldId):null,value=draft.input.value.trim();
      if(draft.cell==='name')entity.name=value;else if(draft.cell==='key'){f.primaryKey=value.includes('PK');f.foreignKey=value.includes('FK');if(f.primaryKey)f.nullable=false;}else f[draft.cell==='dataType'?'dataType':'name']=value;
      M.validate(model);const changed=JSON.stringify(model)!==draft.snapshot;cancelInline();if(changed)commit(model,{selectionId:entity.id});selectedField=f?.id||null;render();
    }
    function addField(tableId){if(pending())throw fail('FORM_PENDING','Termina la edición pendiente.');const entity=M.table(read(),tableId);let n=entity.fields.length+1;while(entity.fields.some(f=>f.name==='campo_'+n))n++;const id=edit({type:'erd_field_upsert',tableId,name:'campo_'+n,dataType:'text',nullable:true});startInline(tableId,id);}
    function deleteField(tableId,fieldId){const model=read();if(model.relationships.some(r=>r.sourceFieldId===fieldId||r.targetFieldId===fieldId)&&!confirm('Eliminar este campo también elimina sus relaciones. ¿Continuar?'))return;edit({type:'erd_field_delete',tableId,fieldId});}
    function fillFieldOptions(selectEl,value){selectEl.replaceChildren();for(const t of read().tables)for(const f of t.fields){const option=new Option(t.name+' · '+f.name,t.id+'|'+f.id);selectEl.appendChild(option);}if(value)selectEl.value=value;}
    function relationDialog(source,target,relation){
      if(pending())throw fail('FORM_PENDING','Termina la edición pendiente.');
      if(!relation){const result=M.apply(read(),{type:'erd_relationship_create',sourceTableId:source.tableId,sourceFieldId:source.fieldId,targetTableId:target.tableId,targetFieldId:target.fieldId});connectionStart=null;relationMode=false;commit(result.model,{selectionId:result.affectedId});report('Relación creada. Selecciónala para cambiar cardinalidad o nombre.');return;}
      select(relation.id);showProperties();
    }
    function removeSelected(){if(!activeId||!selectedId)return;if(pending()){report('Aplica o cierra la edición pendiente antes de eliminar.');return;}const model=read(),entity=model.tables.find(t=>t.id===selectedId);if(entity&&selectedField){deleteField(entity.id,selectedField);return;}if(entity&&model.relationships.some(r=>r.sourceTableId===entity.id||r.targetTableId===entity.id)&&!confirm('Eliminar esta tabla también elimina sus relaciones. ¿Continuar?'))return;edit({type:'erd_delete',elementId:selectedId});}
    $('erdNewTable').onclick=()=>{if(Date.now()>suppressPaletteClickUntil)safe(()=>addTable());};
    $('erdNewTable').addEventListener('pointerdown',down=>{
      if(down.button!==0||!activeId)return;
      const sheet=activeId;let dragged=false,cancelled=false;
      const removePreview=()=>svg.querySelector('.erd-table-preview')?.remove();
      const cancel=()=>{cancelled=true;removePreview();};paletteDrag={cancel};
      const move=event=>{
        if(cancelled||sheet!==activeId)return;
        if(!dragged&&Math.hypot(event.clientX-down.clientX,event.clientY-down.clientY)<5)return;
        dragged=true;event.preventDefault();removePreview();const p=point(event);
        const g=node('g',{class:'erd-table-preview erd-control',opacity:.7,'pointer-events':'none'});
        g.appendChild(node('rect',{x:p.x-150,y:p.y-17,width:300,height:92,rx:3,fill:'#fff',stroke:'#1595cf','stroke-width':1.5}));
        g.appendChild(node('text',{x:p.x,y:p.y+5,'text-anchor':'middle','font-family':'Segoe UI,Arial,sans-serif','font-size':12,fill:'#345b78'},'Nueva tabla'));svg.appendChild(g);
      };
      const end=event=>{
        document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',cancelEnd);removePreview();paletteDrag=null;
        if(!dragged)return;suppressPaletteClickUntil=Date.now()+500;
        const r=svg.getBoundingClientRect();if(!cancelled&&sheet===activeId&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom){const p=point(event);safe(()=>addTable({x:Math.round(p.x-150),y:Math.round(p.y-17)}));}
      };
      const cancelEnd=event=>{cancel();end(event);};
      document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',cancelEnd);
    });
    $('erdNewRelation').onclick=()=>safe(()=>{if(pending())throw fail('FORM_PENDING','Aplica o cierra la edición pendiente.');if(read().tables.filter(t=>t.fields.length).length<1)throw Error('Crea tablas y campos antes de relacionarlos.');relationMode=!relationMode;connectionStart=null;render();report('Selecciona el campo de origen y después el campo de destino.');});
    $('erdAddField').onclick=()=>safe(()=>{const entity=read().tables.find(t=>t.id===selectedId);if(!entity)throw Error('Selecciona una tabla para añadir un campo.');addField(entity.id);});
    $('erdFit').onclick=fit;$('erdShowProperties').onclick=showProperties;
    $('erdTableForm').onsubmit=event=>{event.preventDefault();safe(()=>{const name=$('erdTableName').value,width=Number($('erdTableWidth').value),model=read();M.table(model,selectedId).name=name;M.table(model,selectedId).width=width;commit(model,{selectionId:selectedId});});};
    $('erdRelationForm').onsubmit=event=>{event.preventDefault();safe(()=>{const [sourceTableId,sourceFieldId]=$('erdRelationSource').value.split('|'),[targetTableId,targetFieldId]=$('erdRelationTarget').value.split('|');const result=M.apply(read(),{type:'erd_relationship_update',relationshipId:selectedId,sourceTableId,sourceFieldId,targetTableId,targetFieldId,sourceCardinality:$('erdSourceCardinality').value,targetCardinality:$('erdTargetCardinality').value,label:$('erdRelationLabel').value});commit(result.model,{selectionId:result.affectedId});});};
    $('erdDeleteSelection').onclick=()=>safe(removeSelected);
    svg.addEventListener('dblclick',event=>safe(()=>{const target=document.elementFromPoint(event.clientX,event.clientY)||event.target,f=target.closest('[data-field]'),t=target.closest('[data-table]'),r=target.closest('[data-relation]');if(f)startInline(f.dataset.table,f.dataset.field,target.closest('[data-cell]')?.dataset.cell||'fieldName');else if(t)startInline(t.dataset.table,null,'name');else if(r)relationDialog(null,null,read().relationships.find(x=>x.id===r.dataset.relation));}));
    svg.addEventListener('pointerdown',event=>safe(()=>{
      if(!activeId||event.button>1)return;if(pending())throw fail('FORM_PENDING','Termina la edición con Enter o pulsa Escape para cancelar la celda.');const f=event.target.closest('[data-field]'),t=event.target.closest('[data-table]'),r=event.target.closest('[data-relation]');
      const action=event.target.closest('[data-action]')?.dataset.action;
      if(action){event.preventDefault();if(action==='add-field')return addField(t.dataset.table);if(!selectedField)return;return action==='field-delete'?deleteField(t.dataset.table,selectedField):edit({type:'erd_field_move',tableId:t.dataset.table,fieldId:selectedField,direction:action==='field-up'?'up':'down'});}
      const start=point(event),model=read();
      if(f&&(relationMode||connectionStart||event.target.closest('[data-port]'))){const endpoint={tableId:f.dataset.table,fieldId:f.dataset.field};if(connectionStart){relationDialog(connectionStart,endpoint);connectionStart=null;render();return;}connectionStart=endpoint;gesture={kind:'connect',start,snapshot:JSON.stringify(model),sheet:activeId};render();}
      else if(r){select(r.dataset.relation,null,true);return;}
      else if(t){if(pending())throw Error('Aplica el nombre pendiente antes de mover otra tabla.');const kind=event.target.closest('[data-resize]')?'resize':event.target.closest('[data-role="header"]')?'move':'select';select(t.dataset.table,f?.dataset.field,true);gesture={kind,start,snapshot:JSON.stringify(model),sheet:activeId,tableId:t.dataset.table,original:M.clone(M.table(model,t.dataset.table))};}
      else{if(pending())throw Error('Aplica el nombre pendiente antes de cambiar la selección.');select(null,null,true);gesture={kind:'pan',client:{x:event.clientX,y:event.clientY},view:{...view()},sheet:activeId};}
      if(gesture.kind==='select')return;
      event.preventDefault();svg.setPointerCapture(event.pointerId);
    }));
    svg.addEventListener('pointermove',event=>safe(()=>{
      if(!gesture||gesture.sheet!==activeId)return;const p=point(event);
      if(gesture.kind==='pan'){const v=view();v.x=gesture.view.x-(event.clientX-gesture.client.x)/v.scale;v.y=gesture.view.y-(event.clientY-gesture.client.y)/v.scale;setView();return;}
      if(gesture.kind==='move'||gesture.kind==='resize'){preview=JSON.parse(gesture.snapshot);const t=M.table(preview,gesture.tableId),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(gesture.kind==='move'){t.x=Math.round(gesture.original.x+dx);t.y=Math.round(gesture.original.y+dy);}else t.width=Math.max(200,Math.min(1000,Math.round(gesture.original.width+dx)));svg.replaceChildren(draw(preview));return;}
      if(gesture.kind==='connect'){const old=svg.querySelector('.erd-connection-preview');old?.remove();const t=M.table(modelOrPreview(),connectionStart.tableId),index=t.fields.findIndex(f=>f.id===connectionStart.fieldId),start={x:t.x+t.width,y:t.y+49+index*30};svg.appendChild(node('path',{d:`M${start.x},${start.y} H${(start.x+p.x)/2} V${p.y} H${p.x}`,fill:'none',stroke:'#18a0d8','stroke-width':1.5,'stroke-dasharray':'5 4',class:'erd-connection-preview erd-control','pointer-events':'none'}));}
    }));
    const modelOrPreview=()=>preview||read();
    svg.addEventListener('pointerup',event=>safe(()=>{
      if(!gesture)return;const finished=gesture;gesture=null;
      if(finished.kind==='move'||finished.kind==='resize'){
        const result=preview;preview=null;if(!result)return;if(finished.sheet!==activeId||JSON.stringify(read())!==finished.snapshot){render();throw Error('El modelo cambió durante el arrastre; se conservó la edición más reciente.');}
        if(JSON.stringify(result)!==finished.snapshot)commit(result,{selectionId:finished.tableId});else render();
      }else if(finished.kind==='connect'){
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-field]');
        if(target&&target.dataset.field!==connectionStart?.fieldId){relationDialog(connectionStart,{tableId:target.dataset.table,fieldId:target.dataset.field});connectionStart=null;}
        render();
      }
      if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
    }));
    svg.addEventListener('pointercancel',()=>{gesture=null;preview=null;connectionStart=null;safe(render);});
    svg.addEventListener('wheel',event=>{if(!activeId)return;event.preventDefault();if(event.ctrlKey)zoom(view().scale*(event.deltaY>0?.9:1.1));else{view().x+=event.deltaX/view().scale;view().y+=event.deltaY/view().scale;setView();}},{passive:false});
    document.addEventListener('keydown',event=>{if(!activeId||event.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if(event.key==='Escape'){const changed=!!gesture||!!preview||!!connectionStart||relationMode;paletteDrag?.cancel();gesture=null;preview=null;connectionStart=null;relationMode=false;if(changed)render();}if(['Delete','Backspace'].includes(event.key)){event.preventDefault();safe(removeSelected);}});
    eventBus.on('import.parse.start',()=>{setActive(null,true);views.clear();});
    eventBus.on('commandStack.changed',()=>{if(activeId)safe(render);});
    window.addEventListener('resize',setView);
    function exportSvg(){const model=read(),root=node('svg',{xmlns:NS});let minX=0,minY=0,width=800,height=500;if(model.tables.length){minX=Math.min(...model.tables.map(t=>t.x))-35;minY=Math.min(...model.tables.map(t=>t.y))-35;width=Math.max(...model.tables.map(t=>t.x+t.width))-minX+100;height=Math.max(...model.tables.map(t=>t.y+M.height(t)))-minY+35;}root.setAttribute('width',width);root.setAttribute('height',height);root.setAttribute('viewBox',`${minX} ${minY} ${width} ${height}`);root.appendChild(node('rect',{x:minX,y:minY,width,height,fill:'#fff'}));root.appendChild(draw(model,{controls:false}));return new XMLSerializer().serializeToString(root);}
    const api={list,read,open,close,rename,create:createSheet,duplicateSheet,removeSheet,edit,active:()=>activeId,selected:()=>selectedId,selectedField:()=>selectedField,pending,render,resize:setView,renderProperties,fit,zoom,scale:()=>activeId?view().scale:1,view:()=>activeId?{...view()}:null,restoreView:value=>{if(activeId&&value){views.set(activeId,{...value});setView();}},deleteSelection:removeSelected,exportSvg};
    Object.assign(this,api);window.NaraER=api;
  }
  EntityRelationshipEditor.$inject=['bpmnjs','canvas','commandStack','eventBus','moddle','selection'];
  window.NaraERModule={__init__:['naraER'],naraER:['type',EntityRelationshipEditor]};
})();
