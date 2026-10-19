'use strict';
(() => {
  function StyleEditor(eventBus,elementRegistry,modeling,commandStack,moddle,selection,rules,canvas,naraVisual) {
    const M=window.NaraERModel,$=id=>document.getElementById(id);
    let activeTab='properties';
    const formatBody=document.createElement('div');formatBody.id='formatPanel';formatBody.className='detail-body';formatBody.hidden=true;
    const empty=document.createElement('p');empty.className='detail-intro';empty.textContent='Selecciona una figura para cambiar su formato.';formatBody.appendChild(empty);
    const panel=document.createElement('section');panel.id='visualProperties';panel.className='visual-properties';
    panel.innerHTML='<h3>Formato</h3><details open><summary>Estilo</summary><div class="format-grid"><label>Relleno<input id="styleFill" type="color"></label><label>Línea<input id="styleStroke" type="color"></label><label>Grosor<input id="styleStrokeWidth" type="number" min="0.5" max="6" step="0.5"></label></div></details><details><summary>Texto</summary><div class="format-grid"><label>Color<input id="styleFontColor" type="color"></label><label>Tamaño<input id="styleFontSize" type="number" min="9" max="32"></label><label>Negrita<input id="styleBold" type="checkbox"></label><label>Alineación<select id="styleAlign"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label></div></details><details><summary>Organizar</summary><form id="geometryForm"><div class="format-grid"><label>X<input id="styleX" type="number" min="-100000" max="100000" step="any" required></label><label>Y<input id="styleY" type="number" min="-100000" max="100000" step="any" required></label><label>Ancho<input id="styleWidth" type="number" min="20" max="100000" step="any" required></label><label>Alto<input id="styleHeight" type="number" min="20" max="100000" step="any" required></label></div><button type="submit" class="secondary-button">Aplicar posición y tamaño</button></form></details>';
    const keys=['style','text','arrange'];
    for(const [index,details]of [...panel.querySelectorAll('details')].entries()){
      const section=document.createElement('section');section.id=keys[index]+'Panel';section.dataset.formatTab=keys[index];section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',['tabStyle','tabText','tabArrange'][index]);
      const heading=document.createElement('h2');heading.textContent=details.querySelector('summary').textContent;section.appendChild(heading);
      for(const child of [...details.children])if(child.tagName!=='SUMMARY')section.appendChild(child);details.replaceWith(section);
    }
    panel.querySelector('h3').remove();formatBody.appendChild(panel);$('rightPanel').appendChild(formatBody);
    const fitButton=document.createElement('button');fitButton.type='button';fitButton.className='secondary-button';fitButton.textContent='Ajustar texto y tamaño';$('textPanel').appendChild(fitButton);fitButton.onclick=()=>{const element=target();if(!element)return;try{if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente.');naraVisual.fitText(element,{fontSize:Number($('styleFontSize').value)});}catch(error){$('status').textContent=error.message;}refresh();};
    const sizeHint=document.createElement('p');sizeHint.id='styleSizeHint';sizeHint.className='detail-intro';$('geometryForm').appendChild(sizeHint);
    const tabs=[...document.querySelectorAll('[data-inspector-tab]')];
    function sync(){
      const er=!!window.NaraER?.active();$('propertiesPanel').hidden=activeTab!=='properties'||er;$('erdPropertiesPanel').hidden=activeTab!=='properties'||!er;formatBody.hidden=activeTab==='properties';
      for(const tab of tabs){const active=tab.dataset.inspectorTab===activeTab;tab.setAttribute('aria-selected',String(active));tab.classList.toggle('active',active);tab.tabIndex=active?0:-1;}
      for(const section of panel.querySelectorAll('[data-format-tab]'))section.hidden=section.dataset.formatTab!==activeTab;
    }
    function setTab(value){if(!['properties',...keys].includes(value))return;activeTab=value;sync();$('rightPanel').scrollTop=0;}
    for(const tab of tabs){tab.onclick=()=>setTab(tab.dataset.inspectorTab);tab.onkeydown=event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();tabs[index].focus();setTab(tabs[index].dataset.inspectorTab);};}
    const target=()=>window.NaraER?.active()?window.NaraER.read().tables.find(t=>t.id===window.NaraER.selected())||window.NaraER.read().relationships.find(r=>r.id===window.NaraER.selected()):selection.get()[0];
    function read(element){if(!element)return{};if(!element.businessObject)return element.style||{};const value=element.businessObject.extensionElements?.values?.find(v=>v.$type==='nara:VisualStyle');try{return M.visualStyle(value?JSON.parse(value.json):{});}catch{return{};}}
    function apply(elementId,style){M.visualStyle(style);if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente antes de cambiar el formato.');
      if(window.NaraER?.active()){const value=target();if(value?.id===elementId&&Object.entries(style).every(([key,v])=>read(value)[key]===v))return elementId;return window.NaraER.edit({type:'style',elementId,style});}
      const element=elementRegistry.get(elementId);if(!element?.businessObject||element.labelTarget)throw Error('Selecciona una figura o conexión.');
      if(Object.entries(style).every(([key,value])=>read(element)[key]===value))return elementId;
      naraVisual.applyStyle(element,style);return elementId;
    }
    function decorate(element){if(!element)return;const base=element.labelTarget||element,s=read(base),gfx=elementRegistry.getGraphics(element);if(!gfx)return;
      for(const text of gfx.querySelectorAll('.djs-visual text')){if(s.fontColor){text.style.fill=s.fontColor;text.setAttribute('fill',s.fontColor);}if(s.fontSize){text.style.fontSize=s.fontSize+'px';text.setAttribute('font-size',s.fontSize);}if(s.bold!==undefined){text.style.fontWeight=s.bold?'700':'400';text.setAttribute('font-weight',s.bold?'700':'400');}}
      if(s.strokeWidth)for(const line of gfx.querySelectorAll('.djs-visual > rect,.djs-visual > circle,.djs-visual > polygon,.djs-visual > path')){line.style.strokeWidth=s.strokeWidth+'px';line.setAttribute('stroke-width',s.strokeWidth);}
      if(base.id.startsWith(window.NaraStagePrefix?.()||'Stage_'))for(const rect of gfx.querySelectorAll('.stage-header-fill'))if(s.fill)rect.setAttribute('fill',s.fill);
    }
    function refresh(){
      const er=!!window.NaraER?.active(),element=target();panel.hidden=!element;empty.hidden=!!element;sync();if(!element)return;
      fitButton.hidden=er||!naraVisual.activity(element);const s=read(element),di=element.di,stage=element.type==='bpmn:Group'&&element.id.startsWith(window.NaraStagePrefix?.()||'Stage_');
      for(const [key,value]of Object.entries({Fill:s.fill||di?.fill||'#ffffff',Stroke:s.stroke||di?.stroke||(stage?'#22242a':'#345b78'),StrokeWidth:s.strokeWidth||1.5,FontColor:s.fontColor||(stage?'#22242a':'#213e53'),FontSize:s.fontSize||(er?12:naraVisual.defaultFont(element)),Align:s.align||'center'}))$('style'+key).value=value;
      $('styleBold').checked=!!s.bold;$('styleAlign').disabled=!er;
      const shape=Number.isFinite(element.x)&&!element.waypoints&&!element.sourceTableId;$('geometryForm').hidden=!shape;
      if(shape){for(const [key,value]of Object.entries({X:element.x,Y:element.y,Width:element.width,Height:er?M.height(element):element.height}))$('style'+key).value=String(Math.round(value*100)/100);const resizable=er||!!rules.allowed('shape.resize',{shape:element});$('styleWidth').disabled=!resizable;$('styleHeight').disabled=er||!resizable;$('styleWidth').min=er?'200':'20';$('styleWidth').max=er?'1000':'100000';sizeHint.hidden=!er&&resizable;sizeHint.textContent=er?'La altura de la tabla se ajusta a sus campos.':'Esta figura conserva su tamaño. Puedes cambiar su posición.';}
    }
    for(const [key,name]of Object.entries({Fill:'fill',Stroke:'stroke',StrokeWidth:'strokeWidth',FontColor:'fontColor',FontSize:'fontSize',Bold:'bold',Align:'align'}))$('style'+key).onchange=()=>{const element=target();if(!element)return;const el=$('style'+key);try{if(key==='FontSize'&&!window.NaraER?.active()&&naraVisual.activity(element)){if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente.');naraVisual.fitText(element,{fontSize:Number(el.value)});refresh();return;}apply(element.id,{[name]:key==='Bold'?el.checked:['StrokeWidth','FontSize'].includes(key)?Number(el.value):el.value});}catch(error){if(window.NaraInstantEdit?.applying)throw error;$('status').textContent=error.message;refresh();}};
    $('geometryForm').onsubmit=event=>{event.preventDefault();if(window.NaraInstantEdit?.pending()&&!window.NaraInstantEdit.applying){window.NaraInstantEdit.flush();return;}const element=target();if(!element)return;try{if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente.');const bounds={x:Number($('styleX').value),y:Number($('styleY').value),width:Number($('styleWidth').value),height:Number($('styleHeight').value)};if(!Object.values(bounds).every(Number.isFinite)||Math.abs(bounds.x)>100000||Math.abs(bounds.y)>100000||bounds.width<20||bounds.width>100000||bounds.height<20||bounds.height>100000)throw Error('Posición o tamaño no válido.');
      if(bounds.x===element.x&&bounds.y===element.y&&bounds.width===element.width&&(window.NaraER?.active()||bounds.height===element.height))return;
      if(window.NaraER?.active())window.NaraER.edit({type:'erd_table_update',tableId:element.id,x:bounds.x,y:bounds.y,width:bounds.width});
      else if(rules.allowed('shape.resize',{shape:element,newBounds:bounds}))modeling.resizeShape(element,bounds);
      else if(bounds.width===element.width&&bounds.height===element.height)modeling.moveShape(element,{x:bounds.x-element.x,y:bounds.y-element.y});
      else throw Error('Esta figura conserva su tamaño BPMN; puedes cambiar su posición.');
    }catch(error){if(window.NaraInstantEdit?.applying)throw error;$('status').textContent=error.message;}refresh();};
    eventBus.on(['shape.added','shape.changed','connection.changed'],500,event=>{decorate(event.element);});
    eventBus.on('commandStack.changed',500,()=>{for(const el of elementRegistry.getAll())decorate(el);refresh();});
    eventBus.on('import.done',500,()=>{for(const el of elementRegistry.getAll())decorate(el);refresh();});
    window.NaraStylePanel={read,apply,refresh,sync,setTab};sync();
  }
  StyleEditor.$inject=['eventBus','elementRegistry','modeling','commandStack','moddle','selection','rules','canvas','naraVisual'];
  window.NaraStyleModule={__init__:['naraStyle'],naraStyle:['type',StyleEditor]};
})();
