'use strict';
(() => {
  const orthogonalizeWaypoints=(...args)=>window.NaraModelAudit.orthogonalizeWaypoints(...args);
  const instances=new WeakMap(),fail=(code,message)=>Object.assign(Error(message),{code});
  const activity=e=>!!e?.businessObject&&(e.businessObject.$instanceOf?.('bpmn:Task')||e.type==='bpmn:CallActivity'||e.type==='bpmn:SubProcess'&&e.di?.isExpanded===false);
  const external=e=>e.type==='label'||/(?:Event|Gateway|Flow|Reference)$/.test(e.type);
  function installHistoryGuards(events,registry,modeling){
    const labels=new Map();
    // Native lane reparenting removes/re-appends nodes even when their BPMN
    // process is unchanged. Undo must restore that process/DI order as well.
    events.on('commandStack.elements.move.preExecute',1800,({context:c})=>{
      const parents=new Set(registry.getAll().flatMap(e=>[e.businessObject?.$parent,e.di?.$parent,e.businessObject?.processRef?.$parent]).filter(Boolean));c.naraMoveOrder=[];
      for(const parent of parents)for(const key of ['flowElements','artifacts','participants','messageFlows','planeElement','rootElements']){const values=parent.get(key);if(Array.isArray(values))c.naraMoveOrder.push({values,before:values.slice()});}
    });
    events.on('commandStack.elements.move.reverted',500,({context:c})=>{for(const {values,before}of c.naraMoveOrder||[]){const current=new Set(values);values.splice(0,values.length,...before.filter(v=>current.has(v)),...values.filter(v=>!before.includes(v)));}});
    events.on(['commandStack.shape.delete.preExecute','commandStack.connection.delete.preExecute'],1800,({context:c})=>{
      const e=c.shape||c.connection,bo=e?.businessObject,parents=[bo?.$parent,e?.di?.$parent,bo?.processRef?.$parent];c.naraParentOrder=[];
      for(const parent of parents.filter(Boolean))for(const key of ['flowElements','artifacts','participants','messageFlows','planeElement','rootElements']){const values=parent.get(key);if(Array.isArray(values))c.naraParentOrder.push({values,before:values.slice()});}
      if(e?.labelTarget||e?.label){c.naraDeletedLabelDi=(e.labelTarget||e).di;c.naraDeletedDiLabel=c.naraDeletedLabelDi?.label;}
      if(c.connection)c.naraEndpointRefs=[[e.source?.businessObject,'outgoing'],[e.target?.businessObject,'incoming']].filter(([owner])=>owner).map(([owner,key])=>({owner,key,value:owner[key]?.slice()}));
    });
    events.on(['commandStack.shape.delete.reverted','commandStack.connection.delete.reverted'],500,({context:c})=>{
      for(const {values,before}of c.naraParentOrder||[]){const current=new Set(values),ordered=before.filter(v=>current.has(v));values.splice(0,values.length,...ordered,...values.filter(v=>!before.includes(v)));}
      for(const {owner,key,value}of c.naraEndpointRefs||[])owner.set(key,value?.slice());
      if(c.naraDeletedLabelDi)labels.set(c.naraDeletedLabelDi,c.naraDeletedDiLabel);
    });
    events.on('commandStack.shape.delete.preExecute',1700,({context:c})=>{
      const bo=c.shape?.businessObject;if(!bo?.$instanceOf?.('bpmn:FlowNode'))return;
      for(const lane of registry.getAll().filter(e=>e.type==='bpmn:Lane')){const refs=lane.businessObject.flowNodeRef||[];if(refs.some(ref=>ref.id===bo.id))modeling.updateModdleProperties(lane,lane.businessObject,{flowNodeRef:refs.filter(ref=>ref.id!==bo.id)});}
    });
    events.on('commandStack.shape.resize.preExecute',1700,({context:c})=>{if(c.shape?.labelTarget)c.naraPreviousDiLabel=c.shape.labelTarget.di?.label;});
    events.on('commandStack.shape.resize.reverted',500,({context:c})=>{if(c.shape?.labelTarget&&Object.hasOwn(c,'naraPreviousDiLabel'))labels.set(c.shape.labelTarget.di,c.naraPreviousDiLabel);});
    // Native updateLaneRefs removes/re-appends even unchanged members. Retain
    // ordering across undo/redo without replacing objects or bypassing commands.
    events.on('commandStack.lane.updateRefs.preExecute',1700,({context:c})=>{c.naraLaneOrder=registry.getAll().filter(e=>e.type==='bpmn:Lane').map(e=>({bo:e.businessObject,before:[...e.businessObject.get('flowNodeRef')]}));});
    const restore=(records,key)=>{for(const r of records||[]){const refs=r.bo.get('flowNodeRef');refs.splice(0,refs.length,...r[key]);}};
    events.on('commandStack.lane.updateRefs.executed',500,({context:c})=>{if(!c.naraLaneOrder)return;for(const r of c.naraLaneOrder)if(!r.after)r.after=[...r.bo.get('flowNodeRef')];restore(c.naraLaneOrder,'after');});
    events.on('commandStack.lane.updateRefs.reverted',500,({context:c})=>restore(c.naraLaneOrder,'before'));
    // Label bounds are materialized during shape.changed, after reverted.
    events.on('commandStack.changed',2000,()=>{for(const [di,label]of labels)di?.set('label',label);labels.clear();});
  }
  function build(modeler){
    const get=name=>modeler.get(name,false),modeling=get('modeling'),registry=get('elementRegistry'),canvas=get('canvas'),moddle=get('moddle'),stack=get('commandStack'),events=get('eventBus'),textRenderer=get('textRenderer'),layouter=get('layouter'),rules=get('rules');
    function extension(element,type){return element.businessObject.extensionElements?.values?.find(value=>value.$type===type);}
    function readStyle(element){try{return window.NaraERModel.visualStyle(JSON.parse(extension(element,'nara:VisualStyle')?.json||'{}'));}catch{return{};}}
    function readRouting(element){try{const r=JSON.parse(extension(element,'nara:ConnectionRouting')?.json||'null');if(!r||!['orthogonal','manual'].includes(r.mode)||!['source','target'].every(end=>window.NaraModelAudit.SIDES.includes(r[end]?.side)&&Number.isFinite(r[end]?.offset)&&r[end].offset>=.05&&r[end].offset<=.95))return null;if(r.sharedWith!==undefined&&(typeof r.sharedWith!=='string'||!['source','target'].includes(r.sharedEnd)||![r.joinPoint?.x,r.joinPoint?.y].every(Number.isFinite)))return null;r.manual=r.manual!==false;return r;}catch{return null;}}
    function putExtension(element,type,json){
      const value=moddle.create(type,{json:JSON.stringify(json)}),extensionElements=moddle.create('bpmn:ExtensionElements',{values:[...(element.businessObject.extensionElements?.values||[]).filter(v=>v.$type!==type),value]});
      modeling.updateProperties(element,{extensionElements});
    }
    function applyStyle(element,style){
      const clean=window.NaraERModel.visualStyle(style);
      if(!Object.keys(clean).length||Object.keys(clean).length!==Object.keys(style).length)throw fail('STYLE_INVALID','El formato requiere propiedades visuales admitidas.');
      if(Object.entries(clean).every(([k,v])=>readStyle(element)[k]===v))return;
      stack.execute('nara.visual.style',{element,style:clean});
    }
    stack.registerHandler('nara.visual.style',function(){
      this.preExecute=c=>{const s={...readStyle(c.element),...c.style};putExtension(c.element,'nara:VisualStyle',s);if(c.style.fill!==undefined||c.style.stroke!==undefined)modeling.setColor(c.element,{...(c.style.fill!==undefined?{fill:s.fill}:{}),...(c.style.stroke!==undefined?{stroke:s.stroke}:{})});};
      this.execute=this.revert=c=>[c.element];
    });
    function defaultFont(element){return readStyle(element.labelTarget||element).fontSize??(external(element)?14:16);}
    function textOptions(element,style=readStyle(element),size={width:element.width,height:element.height}){
      const bo=element.businessObject,icon=/^bpmn:(?:User|Manual|Service|Send|Receive|Script|BusinessRule)Task$/.test(element.type),marker=!!bo.loopCharacteristics||bo.isForCompensation||['bpmn:SubProcess','bpmn:CallActivity'].includes(element.type);
      const padding={left:icon?30:10,right:10,top:8,bottom:marker?28:10};
      return{box:{width:size.width,height:Math.max(1,size.height-padding.top-padding.bottom)},padding,align:(style.align||'center')+'-middle',style:{...textRenderer.getDefaultStyle(),fontFamily:'Arial',fontSize:style.fontSize??16,fontWeight:style.bold?'bold':'normal',fill:style.fontColor||element.di?.stroke||'#213e53'}};
    }
    const labelEditor=get('labelEditingProvider');
    if(labelEditor){const native=labelEditor.getEditingBBox.bind(labelEditor);labelEditor.getEditingBBox=element=>{
      const result=native(element);if(!activity(element))return result;
      const {padding,style}=textOptions(element),box=canvas.getAbsoluteBBox(element),zoom=canvas.zoom();
      result.bounds={x:box.x+padding.left*zoom,y:box.y+padding.top*zoom,width:(element.width-padding.left-padding.right)*zoom,height:(element.height-padding.top-padding.bottom)*zoom};
      Object.assign(result.style,{fontFamily:style.fontFamily,fontSize:style.fontSize*zoom+'px',fontWeight:style.fontWeight,lineHeight:style.lineHeight||1.2,textAlign:readStyle(element).align||'center',paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0});return result;
    };}
    function decorate(element){
      if(element.type==='bpmn:TextAnnotation'){
        const visual=registry.getGraphics?.(element)?.querySelector('.djs-visual'),fill=readStyle(element).fill;if(!visual)return;
        let bg=visual.querySelector('.nara-note-background');if(!fill){bg?.remove();return;}
        if(!bg){bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.classList.add('nara-note-background');visual.prepend(bg);}
        for(const [key,value]of Object.entries({x:0,y:0,width:element.width,height:element.height,fill,stroke:'none','pointer-events':'none'}))bg.setAttribute(key,value);return;
      }
      if(!textRenderer?.createText||!activity(element)&&element.type!=='label')return;
      const visual=registry.getGraphics?.(element)?.querySelector('.djs-visual');if(!visual)return;
      const previous=[...visual.children].find(e=>e.tagName.toLowerCase()==='text'&&e.classList.contains('djs-label'));if(!previous)return;
      const owner=element.labelTarget||element;if(owner.type==='bpmn:Group')return;
      const options=activity(element)?textOptions(element):{box:{width:element.width,height:element.height},align:'center-middle',style:{...textRenderer.getExternalStyle(),fontSize:defaultFont(owner),fontWeight:readStyle(owner).bold?'bold':'normal',fill:readStyle(owner).fontColor||'#213e53'}};
      const text=textRenderer.createText(owner.businessObject.name||'',options);text.classList.add('djs-label');text.dataset.naraText=activity(element)?'activity':'external';
      if(activity(element)){text.setAttribute('transform',`translate(0 ${options.padding.top})`);text.dataset.naraTextOffsetY=String(options.padding.top);}
      previous.replaceWith(text);
    }
    function describeText(element){
      const owner=element.labelTarget||element,shape=external(owner)?owner.label:owner,gfx=shape&&registry.getGraphics?.(shape);
      const text=gfx?.querySelector('.djs-visual text.djs-label');if(!text)return null;
      try{
        const b=text.getBBox(),matrix=text.getCTM(),shapeMatrix=gfx.getCTM();let bounds;
        if(matrix&&shapeMatrix){const relative=shapeMatrix.inverse().multiply(matrix),corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:relative.a*x+relative.c*y+relative.e,y:relative.b*x+relative.d*y+relative.f}));const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);bounds={x:shape.x+Math.min(...xs),y:shape.y+Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
        else bounds={x:shape.x+b.x,y:shape.y+b.y+Number(text.dataset.naraTextOffsetY||0),width:b.width,height:b.height};
        const style=readStyle(owner),fontSize=style.fontSize??(external(owner)?14:16);
        const output={rendered:true,bounds,fontSize,lineCount:text.querySelectorAll('tspan').length,contentPreserved:(text.textContent||'').replace(/\s/g,'')===(owner.businessObject.name||'').replace(/\s/g,'')};
        if(activity(owner)){
          const {padding}=textOptions(owner),available={x:owner.x+padding.left,y:owner.y+padding.top,width:owner.width-padding.left-padding.right,height:owner.height-padding.top-padding.bottom};
          const markerBounds=[];if(padding.left>10)markerBounds.push({x:owner.x+8,y:owner.y+8,width:20,height:22});if(padding.bottom>10)markerBounds.push({x:owner.x+8,y:owner.y+owner.height-26,width:owner.width-16,height:22});
          Object.assign(output,{available,markerBounds,fits:bounds.x>=available.x-1&&bounds.y>=available.y-1&&bounds.x+bounds.width<=available.x+available.width+1&&bounds.y+bounds.height<=available.y+available.height+1});
        }
        return output;
      }catch{return null;}
    }
    function fitPlan(element,options={}){
      if(!activity(element))throw fail('TEXT_FIT_UNSUPPORTED','El ajuste de texto y tamaño requiere una tarea, actividad de llamada o subproceso contraído.');
      const style={...readStyle(element),fontSize:options.fontSize??readStyle(element).fontSize??16};window.NaraERModel.visualStyle(style);
      const minWidth=Math.max(100,options.minWidth??element.width),maxWidth=Math.max(minWidth,options.maxWidth??Math.max(320,element.width)),minHeight=Math.max(80,options.minHeight??element.height),maxHeight=Math.max(minHeight,options.maxHeight??Math.max(240,element.height));
      const parent=element.parent,ancestors=new Set();for(let p=parent;p&&!ancestors.has(p.id);p=p.parent)ancestors.add(p.id);
      const others=registry.getAll().filter(e=>e.id!==element.id&&!ancestors.has(e.id)&&!e.waypoints&&!e.labelTarget&&!['bpmn:Lane','bpmn:Participant','bpmn:Group','bpmn:Process','bpmn:Collaboration'].includes(e.type)&&canvas.findRoot(e)===canvas.getRootElement()&&e.host?.id!==element.id);
      let best;
      for(let width=minWidth;width<=maxWidth;width=Math.min(maxWidth,width+20)){
        const layout=textOptions(element,style,{width,height:maxHeight}),dimensions=textRenderer.getDimensions(element.businessObject.name||'',layout),height=Math.max(minHeight,Math.ceil(dimensions.height)+layout.padding.top+layout.padding.bottom+2),bounds={x:element.x,y:element.y,width,height};
        const inside=!parent?.parent||bounds.x>=parent.x+4&&bounds.x+width<=parent.x+parent.width-4&&bounds.y>=parent.y+4&&bounds.y+height<=parent.y+parent.height-4;
        if(height<=maxHeight&&inside&&!others.some(e=>e.width>0&&e.height>0&&window.NaraModelAudit.boxesOverlap(bounds,e))){const score=width*height+(width-element.width)*8;if(!best||score<best.score)best={bounds,style,score};}
        if(width===maxWidth)break;
      }
      if(!best)throw fail('TEXT_FIT_NO_SPACE','El texto no cabe con esa fuente y el espacio libre. Amplía o mueve el conjunto afectado; no reduzcas unas tareas para hacerlas caber.');
      return best;
    }
    stack.registerHandler('nara.visual.fitText',function(){
      this.preExecute=c=>{const plan=c.plan||fitPlan(c.element,c.options);applyStyle(c.element,{fontSize:plan.style.fontSize});if(['x','y','width','height'].some(k=>c.element[k]!==plan.bounds[k]))modeling.resizeShape(c.element,plan.bounds,undefined,{autoResize:false});c.bounds=plan.bounds;};
      this.execute=this.revert=c=>[c.element];
    });
    const snapshot=()=>({elements:registry.getAll().filter(e=>e.businessObject&&!e.labelTarget&&canvas.findRoot(e)===canvas.getRootElement()).map(e=>({id:e.id,type:e.type,parentId:e.parent?.id,flowScopeId:e.businessObject.$parent?.id,x:e.x,y:e.y,width:e.width,height:e.height,sourceId:e.source?.id,targetId:e.target?.id,waypoints:e.waypoints,routing:readRouting(e),labelBounds:describeText(e)?.bounds||(e.label?{x:e.label.x,y:e.label.y,width:e.label.width,height:e.label.height}:undefined)}))});
    function planRoute(element,options={}){
      return window.NaraModelAudit.routeOrthogonal(snapshot(),{...options,elementId:element.id});
    }
    function edgeAnchor(shape,point){if(!point)return null;const anchor=window.NaraModelAudit.inferAnchor(shape,point),edge=anchor&&window.NaraModelAudit.anchorPoint(shape,anchor.side,anchor.offset);return edge&&Math.hypot(edge.x-point.x,edge.y-point.y)<=2?anchor:null;}
    stack.registerHandler('nara.visual.route',function(){
      this.preExecute=c=>{
        const connection=c.element;
        let result=c.plan;
        if(c.waypoints){const source=window.NaraModelAudit.inferAnchor(connection.source,c.waypoints[0]),target=window.NaraModelAudit.inferAnchor(connection.target,c.waypoints.at(-1));result={waypoints:orthogonalizeWaypoints(c.waypoints,{sourceSide:source.side,targetSide:target.side}),routing:{mode:'orthogonal',manual:true,anchorPolicy:{source:'fixed',target:'fixed'},source,target}};}
        else if(!result)result=planRoute(connection,c.options);
        result={...result,routing:{...result.routing,manual:result.routing.manual??false}};putExtension(connection,'nara:ConnectionRouting',result.routing);modeling.updateWaypoints(connection,result.waypoints,{naraExplicitRoute:true});c.result=result;
      };this.execute=this.revert=c=>[c.element];
    });
    function orthogonal(element,options={}){options={...options};if(options.preserveSides&&!readRouting(element)){options.sourceSide=window.NaraModelAudit.inferAnchor(element.source,element.waypoints[0]).side;options.targetSide=window.NaraModelAudit.inferAnchor(element.target,element.waypoints.at(-1)).side;}const plan=planRoute(element,options);stack.execute('nara.visual.route',{element,options,plan});return element;}
    function manualRoute(element,waypoints){stack.execute('nara.visual.route',{element,waypoints});return element;}
    function compactContainer(element,options={}){const plan=window.NaraModelAudit.planContainerFit(snapshot(),element.id,options);modeling.resizeShape(element,{x:plan.x,y:plan.y,width:plan.width,height:plan.height},undefined,{autoResize:false});return element;}
    function sharedPlan(connection,reference,point,end='target',sourcePoint,cachedSnapshot){
      const data=cachedSnapshot?{...cachedSnapshot,elements:cachedSnapshot.elements.slice()}:snapshot(),source=end==='source'?reference.source:connection.source,target=end==='target'?reference.target:connection.target;
      const virtual={id:connection.id||'__nara_shared_preview',type:connection.type,sourceId:source.id,targetId:target.id,flowScopeId:connection.businessObject?.$parent?.id||source.businessObject?.$parent?.id,parentId:source.parent?.id,waypoints:connection.waypoints||[{x:source.x+source.width/2,y:source.y+source.height/2},{x:target.x+target.width/2,y:target.y+target.height/2}],routing:connection.businessObject?readRouting(connection):undefined};
      data.elements=data.elements.filter(e=>e.id!==virtual.id);data.elements.push(virtual);
      const freeShape=end==='source'?target:source;let anchor=sourcePoint&&window.NaraModelAudit.inferAnchor(freeShape,sourcePoint);
      if(anchor){const edge=window.NaraModelAudit.anchorPoint(freeShape,anchor.side,anchor.offset);if(Math.hypot(edge.x-sourcePoint.x,edge.y-sourcePoint.y)>2)anchor=null;}
      return window.NaraModelAudit.shareConnectionPath(data,{elementId:virtual.id,withConnectionId:reference.id,point,end,...(anchor?(end==='source'?{targetSide:anchor.side,targetOffset:anchor.offset}:{sourceSide:anchor.side,sourceOffset:anchor.offset}):{})});
    }
    stack.registerHandler('nara.visual.share',function(){
      this.preExecute=c=>{
        let connection=c.connection;
        if(!connection)connection=c.connection=modeling.connect(c.source,c.reference.target,c.attrs,{connectionStart:c.connectionStart});
        else if(c.end==='source'&&connection.source!==c.reference.source)modeling.reconnectStart(connection,c.reference.source,c.plan.waypoints[0],{docking:'source'});
        else if(c.end!=='source'&&connection.target!==c.reference.target)modeling.reconnectEnd(connection,c.reference.target,c.plan.waypoints.at(-1),{docking:'target'});
        putExtension(connection,'nara:ConnectionRouting',c.plan.routing);modeling.updateWaypoints(connection,c.plan.waypoints,{naraExplicitRoute:true});
      };this.execute=this.revert=c=>[c.connection];
    });
    function shareConnection(connection,reference,point,end='target'){
      if(connection[end]!==reference[end])throw fail('SHARED_TARGET_REQUIRED','Selecciona conexiones con el mismo '+(end==='source'?'origen.':'destino.'));
      const plan=sharedPlan(connection,reference,point,end);stack.execute('nara.visual.share',{connection,reference,end,plan});return connection;
    }
    function repairEndpoint(points,shape,anchor){
      const first=window.NaraModelAudit.anchorPoint(shape,anchor.side,anchor.offset),v={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]}[anchor.side],next=points[1];points[0]=first;
      if(!next)return points;
      if((next.x-first.x)*v[0]+(next.y-first.y)*v[1]>1){if(v[0])next.y=first.y;else next.x=first.x;}
      else{const stub={x:first.x+v[0]*12,y:first.y+v[1]*12},bend=v[0]?{x:stub.x,y:next.y}:{x:next.x,y:stub.y};points.splice(1,0,stub,bend);}
      return points;
    }
    const reconnectPlans=new WeakMap();
    function reconnectPlan(connection,{sourceId,targetId,sourcePoint,targetPoint}={},data=snapshot()){
      let routing=readRouting(connection);const movedEnd=sourcePoint?'source':targetPoint?'target':null;
      if(routing?.sharedWith&&movedEnd){
        const end=routing.sharedEnd||'target',reference=registry.get(routing.sharedWith);
        if(end!==movedEnd&&reference){const virtual={...connection,source:sourceId?registry.get(sourceId):connection.source,target:targetId?registry.get(targetId):connection.target};return sharedPlan(virtual,reference,routing.joinPoint,end,sourcePoint||targetPoint,data);}
        routing={...routing};delete routing.sharedWith;delete routing.sharedEnd;delete routing.joinPoint;
      }
      return window.NaraModelAudit.planReconnectPreview(data,connection.id,{sourceId,targetId,sourcePoint,targetPoint,routing});
    }
    const preview=get('connectionPreview');
    const roundPoints=points=>points.map(p=>({x:Math.round(p.x),y:Math.round(p.y)}));
    function interactivePlan(connection,points,snap){
      if(snap){const end=connection.target===snap.reference.target?'target':'source';try{return sharedPlan(connection,snap.reference,snap.point,end);}catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_CYCLE'].includes(error.code))throw error;}}
      const source=window.NaraModelAudit.inferAnchor(connection.source,points[0]),target=window.NaraModelAudit.inferAnchor(connection.target,points.at(-1));
      return {waypoints:orthogonalizeWaypoints(roundPoints(points),{sourceSide:source.side,targetSide:target.side}),routing:{mode:'orthogonal',manual:true,source,target}};
    }
    if(preview){
      const draw=preview.drawPreview.bind(preview);
      preview.drawPreview=(context,allowed,hints={})=>{
        if(context.naraSharedPlan){hints={...hints,source:context.source,target:context.target,waypoints:context.naraSharedPlan.waypoints,noLayout:true,noCropping:true};allowed=context.naraSharedAllowed;}
        else if(allowed&&context.hover&&!context.hover.waypoints&&['reconnectStart','reconnectEnd'].includes(context.type)){
          try{
            const rounded=p=>p&&({x:Math.round(p.x),y:Math.round(p.y)}),plan=reconnectPlan(context.connection,{sourceId:hints.source?.id,targetId:hints.target?.id,sourcePoint:rounded(hints.connectionStart),targetPoint:rounded(hints.connectionEnd)},context.naraRouteSnapshot||(context.naraRouteSnapshot=snapshot()));
            hints={...hints,waypoints:plan.waypoints,noLayout:true,noCropping:true};
          }catch(error){if(!['ROUTE_BLOCKED','ROUTE_SELF_LOOP','ROUTE_GEOMETRY_MISSING'].includes(error.code))throw error;}
        }else if(hints.noLayout&&hints.waypoints?.length>1&&context.connection?.source&&context.connection?.target){
          const plan=context.naraCommitPlan=interactivePlan(context.connection,hints.waypoints,context.naraSnap);
          hints={...hints,waypoints:plan.waypoints,noCropping:true};
        }else if(!allowed&&context.connection&&['reconnectStart','reconnectEnd'].includes(context.type)&&(!context.hover||!context.hover.parent)){
          // Empty canvas is an unfinished gesture, not a forbidden BPMN target.
          // Show the actual orthogonal outline without the misleading red icon.
          const connection=context.connection,sourceEnd=context.type==='reconnectStart',point=sourceEnd?hints.connectionStart:hints.connectionEnd;
          if(point){const fixed=sourceEnd?connection.waypoints.at(-1):connection.waypoints[0],anchor=window.NaraModelAudit.inferAnchor(sourceEnd?connection.target:connection.source,fixed),points=sourceEnd?[point,fixed]:[fixed,point];hints={...hints,source:connection.source,target:connection.target,waypoints:orthogonalizeWaypoints(roundPoints(points),sourceEnd?{targetSide:anchor.side}:{sourceSide:anchor.side}),noLayout:true,noCropping:true};allowed={type:connection.type};}
        }
        return draw(context,allowed,hints);
      };
    }
    if(events){
      installHistoryGuards(events,registry,modeling);
      events.on('commandStack.connection.reconnect.preExecute',1800,({context:c})=>{
        const points=c.dockingOrPoints,hints=c.hints||{},end=hints.docking||(c.newSource&&!c.newTarget?'source':'target'),point=Array.isArray(points)?(end==='source'?points[0]:points.at(-1)):points;
        try{c.naraReconnectPlan=reconnectPlan(c.connection,{sourceId:c.newSource?.id,targetId:c.newTarget?.id,sourcePoint:hints.connectionStart||(end==='source'?point:undefined),targetPoint:hints.connectionEnd||(end==='target'?point:undefined)});}catch(error){if(!['ROUTE_BLOCKED','ROUTE_SELF_LOOP','ROUTE_GEOMETRY_MISSING'].includes(error.code))throw error;}
      });
      // Preserve the sheet title and metadata when the native modeler replaces
      // an empty Process with a Collaboration to host its first participant.
      events.on('commandStack.canvas.updateRoot.preExecute',1800,({context:c})=>{
        const previous=canvas.getRootElement()?.businessObject,next=c.newRoot?.businessObject;
        if(previous?.$type!=='bpmn:Process'||next?.$type!=='bpmn:Collaboration')return;
        if(!next.name&&previous.name)next.name=previous.name;
        const copied=get('moddleCopy')?.copyElement(previous,get('bpmnFactory').create('bpmn:Collaboration'),['documentation','extensionElements']);
        for(const key of ['documentation','extensionElements'])if(!next[key]&&copied?.[key]){next[key]=copied[key];if(Array.isArray(next[key]))for(const value of next[key])value.$parent=next;else next[key].$parent=next;}
      });
      // Native MovePreview translates figure ghosts but omits incident edges.
      // Render our plans in the untransformed layer, using the rounded drop delta.
      events.on('shape.move.move',200,event=>{
        const c=event.context;c.naraMovePreview?.remove();c.naraMovePreview=null;for(const e of c.naraMoveMarked||[])canvas.removeMarker(e,'djs-dragging');c.naraMoveMarked=[];
        if(!c.canExecute||!c.allDraggedElements)return;
        const data=c.naraMoveSnapshot||(c.naraMoveSnapshot=snapshot()),ids=c.allDraggedElements.filter(e=>!e.waypoints).map(e=>e.id),delta={x:Math.round(event.dx),y:Math.round(event.dy)};
        const plans=window.NaraModelAudit.planMovedRoutes(data,{elementIds:ids,delta}),group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class','djs-drag-group nara-route-preview');group.style.pointerEvents='none';
        for(const plan of plans){const connection=registry.get(plan.elementId),original=registry.getGraphics(connection)?.querySelector('.djs-visual'),visual=original?.cloneNode(true);if(!visual)continue;
          if(!c.allDraggedElements.includes(connection)){canvas.addMarker(connection,'djs-dragging');c.naraMoveMarked.push(connection);}
          // Markers contain paths too. Reuse their original definitions instead
          // of duplicating IDs or accidentally replacing the arrowhead path.
          visual.querySelectorAll('defs').forEach(e=>e.remove());const path=visual.querySelector(':scope > path');
          if(path){const rendered=document.createElementNS('http://www.w3.org/2000/svg','g');get('graphicsFactory').drawConnection(rendered,{...connection,businessObject:connection.businessObject,di:connection.di,source:connection.source,target:connection.target,waypoints:plan.waypoints});path.setAttribute('d',rendered.querySelector(':scope > path').getAttribute('d'));}group.appendChild(visual);
        }
        canvas.getActiveLayer().appendChild(group);c.naraMovePreview=group;c.naraMovePlans=plans;
      });
      events.on('shape.move.cleanup',200,({context:c})=>{c.naraMovePreview?.remove();c.naraMovePreview=null;for(const e of c.naraMoveMarked||[])canvas.removeMarker(e,'djs-dragging');c.naraMoveMarked=[];});
      events.on('commandStack.elements.move.preExecute',1700,({context:c})=>{c.naraMoveSnapshot=snapshot();});
      events.on('commandStack.elements.move.postExecuted',300,({context:c})=>{
        const ids=Object.keys(c.closure.allShapes),plans=window.NaraModelAudit.planMovedRoutes(c.naraMoveSnapshot,{elementIds:ids,delta:c.delta});
        for(const plan of plans){const connection=registry.get(plan.elementId),r=readRouting(connection);if(!r)continue;
          if(JSON.stringify(r)!==JSON.stringify(plan.routing))putExtension(connection,'nara:ConnectionRouting',plan.routing);
          if(JSON.stringify(connection.waypoints.map(p=>({x:p.x,y:p.y})))!==JSON.stringify(plan.waypoints))modeling.updateWaypoints(connection,plan.waypoints,{naraExplicitRoute:true});
        }
      });
      events.on('commandStack.connection.layout.postExecute',1400,({context:c})=>{
        const connection=c.connection,r=readRouting(connection);if(!r)return;
        const source=window.NaraModelAudit.inferAnchor(connection.source,connection.waypoints[0]),target=window.NaraModelAudit.inferAnchor(connection.target,connection.waypoints.at(-1));
        if(JSON.stringify(r.source)!==JSON.stringify(source)||JSON.stringify(r.target)!==JSON.stringify(target))putExtension(connection,'nara:ConnectionRouting',{...r,source,target});
      });
      events.on('commandStack.connection.delete.preExecute',1600,({context:c})=>{for(const e of registry.getAll().filter(e=>e.waypoints&&readRouting(e)?.sharedWith===c.connection.id)){const routing={...readRouting(e)};delete routing.sharedWith;delete routing.sharedEnd;delete routing.joinPoint;putExtension(e,'nara:ConnectionRouting',routing);}});
      const pendingSnap=new WeakMap(),pendingInteractive=new WeakMap();
      function nearbyEndpoint(event){
        const c=event.context,connection=c.connection;if(!connection||!['reconnectStart','reconnectEnd'].includes(c.type)||![event.x,event.y].every(Number.isFinite))return;
        if(c.naraNearby){canvas.removeMarker(c.naraNearby,'connect-ok');canvas.removeMarker(c.naraNearby,'connect-hover');if(c.hover===c.naraNearby){c.hover=null;c.allowed=false;c.source=c.target=null;}c.naraNearby=null;}
        if(c.hover?.parent||event.originalEvent?.altKey)return;
        const start=c.type==='reconnectStart',point={x:event.x,y:event.y};let nearest;
        for(const shape of registry.getAll().filter(e=>e.parent&&!e.labelTarget&&!e.waypoints&&e.width>0&&e.height>0&&!['bpmn:Lane','bpmn:Participant','bpmn:Group'].includes(e.type)&&canvas.findRoot(e)===canvas.getRootElement())){
          const anchor=window.NaraModelAudit.inferAnchor(shape,point),edge=window.NaraModelAudit.anchorPoint(shape,anchor.side,anchor.offset),distance=Math.hypot(edge.x-point.x,edge.y-point.y);if(distance>18/canvas.zoom()||nearest&&nearest.distance<=distance)continue;
          const source=start?shape:connection.source,target=start?connection.target:shape,allowed=rules.allowed('connection.reconnect',{connection,source,target});if(source===target||!allowed)continue;nearest={shape,distance,source,target,allowed};
        }
        if(nearest){c.naraNearby=c.hover=nearest.shape;c.source=nearest.source;c.target=nearest.target;c.allowed=nearest.allowed;canvas.addMarker(nearest.shape,'connect-ok');canvas.addMarker(nearest.shape,'connect-hover');}
      }
      events.on(['bendpoint.move.move','bendpoint.move.end'],1700,nearbyEndpoint);
      events.on('bendpoint.move.cleanup',500,event=>{if(event.context.naraNearby){canvas.removeMarker(event.context.naraNearby,'connect-ok');canvas.removeMarker(event.context.naraNearby,'connect-hover');}});
      function snapShared(event){
        const c=event.context,connection=c.connection;
        if(c.naraSnap)canvas.removeMarker(c.naraSnap.reference,'nara-snap-target');c.naraSnap=null;
        const segment=event.type.startsWith('connectionSegment.');
        if(!connection||!segment&&c.type!=='updateWaypoints'||event.originalEvent?.altKey)return;
        let nearest;const tolerance=7/canvas.zoom();
        for(const reference of registry.getAll().filter(e=>e!==connection&&e.waypoints&&canvas.findRoot(e)===canvas.getRootElement()&&(e.source===connection.source||e.target===connection.target))){
          const projected=window.NaraModelAudit.projectRoute(reference.waypoints,{x:event.x,y:event.y});if(!projected||projected.distance>tolerance)continue;
          if(segment){
            const a=reference.waypoints[projected.index],b=reference.waypoints[projected.index+1],u=c.segmentStart,v=c.segmentEnd;
            if(c.axis==='y'&&Math.abs(a.y-b.y)>.01||c.axis==='x'&&Math.abs(a.x-b.x)>.01||(v.x-u.x)*(b.x-a.x)+(v.y-u.y)*(b.y-a.y)<=0)continue;
          }
          if(!nearest||projected.distance<nearest.distance)nearest={...projected,reference};
        }
        if(nearest){const axis=segment?c.axis:null,p=nearest.point;if(!axis||axis==='x'){event.dx+=p.x-event.x;event.x=p.x;}if(!axis||axis==='y'){event.dy+=p.y-event.y;event.y=p.y;}c.naraSnap=nearest;canvas.addMarker(nearest.reference,'nara-snap-target');}
      }
      events.on(['connectionSegment.move.move','connectionSegment.move.end','bendpoint.move.move','bendpoint.move.end'],1400,snapShared);
      events.on('connectionSegment.move.move',500,event=>{
        const c=event.context;if(!c.newWaypoints?.length)return;
        const plan=c.naraCommitPlan=interactivePlan(c.connection,c.newWaypoints,c.naraSnap);c.newWaypoints=plan.waypoints;c.connection.waypoints=plan.waypoints;
        get('graphicsFactory').update('connection',c.connection,event.connectionGfx||registry.getGraphics(c.connection));
      });
      events.on(['connectionSegment.move.end','bendpoint.move.end'],1250,event=>{if(event.context.naraCommitPlan)pendingInteractive.set(event.context.connection,event.context.naraCommitPlan);});
      events.on(['connectionSegment.move.end','bendpoint.move.end'],1300,event=>{if(event.context.naraSnap)pendingSnap.set(event.context.connection,event.context.naraSnap);});
      events.on(['connectionSegment.move.cleanup','bendpoint.move.cleanup'],500,event=>{const snap=event.context.naraSnap;if(snap)canvas.removeMarker(snap.reference,'nara-snap-target');pendingSnap.delete(event.context.connection);pendingInteractive.delete(event.context.connection);});
      function prepareShare(event){
        const c=event.context,reference=c.hover||event.hover,connection=c.connection,isNew=!!c.start,end=c.type==='reconnectStart'?'source':'target';
        c.naraSharedPlan=null;
        if(!reference?.waypoints||reference===connection||!isNew&&!['reconnectStart','reconnectEnd'].includes(c.type)||event.originalEvent?.altKey||![event.x,event.y].every(Number.isFinite))return;
        const source=isNew?c.start:end==='source'?reference.source:connection.source,target=isNew||end==='target'?reference.target:connection.target;
        if(source===target)return;
        const allowed=rules.allowed(isNew?'connection.create':'connection.reconnect',{source,target,...(!isNew?{connection}:{})});if(!allowed)return;
        try{
          c.naraSharedPlan=sharedPlan(connection||{type:allowed.type,source},reference,{x:event.x,y:event.y},end,isNew?c.initialConnectionStart||c.connectionStart:undefined,c.naraSharedSnapshot||(c.naraSharedSnapshot=snapshot()));
          c.naraSharedReference=reference;c.naraSharedEnd=end;c.naraSharedAllowed=typeof allowed==='object'?allowed:{type:connection?.type||'bpmn:SequenceFlow'};c.source=source;c.target=target;c.canExecute=c.allowed=c.naraSharedAllowed;
          canvas.removeMarker(reference,'connect-not-ok');canvas.addMarker(reference,'connect-ok');
        }catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_DIAGONAL','SHARED_TARGET_REQUIRED','SHARED_ROUTE_CYCLE','SHARED_ROUTE_EMPTY'].includes(error.code))throw error;}
      }
      events.on(['connect.hover','bendpoint.move.hover'],950,prepareShare);
      events.on(['connect.move','bendpoint.move.move'],1200,prepareShare);
      const commitShare=event=>{
        const c=event.context;if(!c.naraSharedPlan)return;
        const command={connection:c.start?undefined:c.connection,source:c.start,reference:c.naraSharedReference,end:c.naraSharedEnd,attrs:c.naraSharedAllowed,connectionStart:c.connectionStart,plan:c.naraSharedPlan};stack.execute('nara.visual.share',command);c.connection=command.connection;return true;
      };
      events.on('connect.end',1500,commitShare);events.on('bendpoint.move.end',1050,commitShare);
      events.on('commandStack.shape.resize.postExecute',500,({context:c})=>{
        const pool=c.shape;if(pool?.type!=='bpmn:Participant'||!c.oldBounds)return;
        const right=pool.x+pool.width;
        for(const lane of registry.getAll().filter(e=>e.type==='bpmn:Lane')){
          let contained=false;for(let p=lane.parent;p;p=p.parent)if(p===pool){contained=true;break;}
          if(contained&&(lane.x+lane.width>right||Math.abs(lane.x+lane.width-c.oldBounds.x-c.oldBounds.width)<.1)&&Math.abs(lane.x+lane.width-right)>.1&&right-lane.x>=60)modeling.resizeShape(lane,{x:lane.x,y:lane.y,width:right-lane.x,height:lane.height},undefined,{autoResize:false});
        }
      });
      events.on('commandStack.shape.resize.canExecute',1600,event=>{const {shape,newBounds}=event.context;if(!activity(shape))return;return !newBounds||[newBounds.x,newBounds.y,newBounds.width,newBounds.height].every(Number.isFinite)&&newBounds.width>=100&&newBounds.height>=80;});
      events.on('commandStack.connection.updateWaypoints.preExecute',1600,event=>{
        const c=event.context,r=readRouting(c.connection);if(c.hints?.naraExplicitRoute||c.newWaypoints.length<2)return;
        const previewPlan=pendingInteractive.get(c.connection);pendingInteractive.delete(c.connection);
        if(previewPlan&&(c.hints?.segmentMove||c.hints?.bendpointMove)){pendingSnap.delete(c.connection);c.newWaypoints=previewPlan.waypoints;putExtension(c.connection,'nara:ConnectionRouting',previewPlan.routing);return;}
        const snap=pendingSnap.get(c.connection);pendingSnap.delete(c.connection);
        if(snap){const end=c.connection.target===snap.reference.target?'target':'source';try{const plan=sharedPlan(c.connection,snap.reference,snap.point,end);putExtension(c.connection,'nara:ConnectionRouting',plan.routing);c.newWaypoints=plan.waypoints;return;}catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_CYCLE'].includes(error.code))throw error;}}
        const interactive=c.hints?.segmentMove||c.hints?.bendpointMove;
        let points=c.newWaypoints.map(p=>({...p}));
        if(r?.mode==='orthogonal'&&!interactive&&r.manual){points=repairEndpoint(points,c.connection.source,r.source);points=repairEndpoint(points.reverse(),c.connection.target,r.target).reverse();}
        const source=interactive||!r?window.NaraModelAudit.inferAnchor(c.connection.source,points[0]):r.source,target=interactive||!r?window.NaraModelAudit.inferAnchor(c.connection.target,points.at(-1)):r.target;
        c.newWaypoints=orthogonalizeWaypoints(points,{sourceSide:source.side,targetSide:target.side});
        if(interactive||!r)putExtension(c.connection,'nara:ConnectionRouting',{mode:'orthogonal',manual:!!interactive,anchorPolicy:{source:interactive?'fixed':'auto',target:interactive?'fixed':'auto'},source,target});
      });
      const synchronizing=new Set();
      events.on(['commandStack.connection.updateWaypoints.postExecute','commandStack.connection.layout.postExecute'],500,event=>{
        const reference=event.context.connection;if(synchronizing.has(reference))return;synchronizing.add(reference);
        try{for(const connection of registry.getAll().filter(e=>e.waypoints&&readRouting(e)?.sharedWith===reference.id)){
          const r=readRouting(connection),end=r.sharedEnd||'target';if(connection[end]!==reference[end])continue;
          try{const plan=sharedPlan(connection,reference,r.joinPoint,end);if(JSON.stringify(plan.waypoints)===JSON.stringify(connection.waypoints))continue;putExtension(connection,'nara:ConnectionRouting',plan.routing);modeling.updateWaypoints(connection,plan.waypoints,{naraExplicitRoute:true});}catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_CYCLE','SHARED_ROUTE_DIAGONAL'].includes(error.code))throw error;}
        }}finally{synchronizing.delete(reference);}
      });
      events.on('commandStack.connection.reconnect.postExecute',1600,event=>{
        const c=event.context,connection=c.connection,old=readRouting(connection)||{mode:'orthogonal',source:window.NaraModelAudit.inferAnchor(connection.source,connection.waypoints[0]),target:window.NaraModelAudit.inferAnchor(connection.target,connection.waypoints.at(-1))};
        if(c.naraReconnectPlan){putExtension(connection,'nara:ConnectionRouting',c.naraReconnectPlan.routing);reconnectPlans.set(connection,c.naraReconnectPlan);return;}
        const docking=c.dockingOrPoints,points=Array.isArray(docking)?docking:connection.waypoints,hints=c.hints||{},side=hints.docking;
        const source=side!=='target'?window.NaraModelAudit.inferAnchor(connection.source,hints.connectionStart||(Array.isArray(docking)?docking[0]:docking)||points[0]):old.source;
        const target=side!=='source'?window.NaraModelAudit.inferAnchor(connection.target,hints.connectionEnd||(Array.isArray(docking)?docking.at(-1):docking)||points.at(-1)):old.target;
        putExtension(connection,'nara:ConnectionRouting',{...old,source,target,anchorPolicy:{...old.anchorPolicy,...(side!=='target'?{source:'fixed'}:{}),...(side!=='source'?{target:'fixed'}:{})}});
      });
      events.on('commandStack.connection.reconnect.postExecute',400,({context:c})=>reconnectPlans.delete(c.connection));
      events.on('commandStack.connection.create.postExecute',500,event=>{
        const c=event.context,connection=c.connection;if(!connection?.source||!connection?.target||connection.source===connection.target||readRouting(connection))return;
        const anchor=edgeAnchor(connection.source,c.hints?.connectionStart);
        try{orthogonal(connection,{sourceSide:anchor?.side||'auto',...(anchor?{sourceOffset:anchor.offset}:{})});}catch(error){if(error.code!=='ROUTE_BLOCKED')throw error;manualRoute(connection,connection.waypoints);}
      });
      events.on(['shape.changed','shape.added'],400,event=>decorate(event.element));
      events.on('import.done',400,()=>registry.getAll().forEach(decorate));
    }
    if(layouter){
      const native=layouter.layoutConnection.bind(layouter);
      layouter.layoutConnection=(connection,hints={})=>{
        if(reconnectPlans.has(connection))return reconnectPlans.get(connection).waypoints;
        const normalize=points=>orthogonalizeWaypoints(points,{sourceSide:window.NaraModelAudit.inferAnchor(hints.source||connection.source,points[0])?.side,targetSide:window.NaraModelAudit.inferAnchor(hints.target||connection.target,points.at(-1))?.side});
        const routing=readRouting(connection);if(routing?.mode!=='orthogonal')return normalize(native(connection,hints));
        if(routing.sharedWith){const reference=registry.get(routing.sharedWith);if(reference&&connection[routing.sharedEnd||'target']===reference[routing.sharedEnd||'target'])try{return sharedPlan(connection,reference,routing.joinPoint,routing.sharedEnd).waypoints;}catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_DIAGONAL'].includes(error.code))throw error;}}
        // Reconnect hints are intentional docking choices; shape movement uses
        // the persisted automatic/fixed policy instead of its inherited hints.
        if(routing.manual)return window.NaraModelAudit.planReconnectPreview(snapshot(),connection.id,{routing}).waypoints;
        try{return planRoute(connection).waypoints;}catch(error){
          if(!['ROUTE_BLOCKED','ROUTE_SELF_LOOP'].includes(error.code))throw error;
          // Keep native undo/movement intact when an imported or crowded layout
          // has no local solution. The subsequent quality audit reports it.
          return normalize(native(connection,{...hints,connectionStart:window.NaraModelAudit.anchorPoint(connection.source,routing.source.side,routing.source.offset),connectionEnd:window.NaraModelAudit.anchorPoint(connection.target,routing.target.side,routing.target.offset)}));
        }
      };
    }
    if(textRenderer?.getExternalLabelBounds){
      const nativeBounds=textRenderer.getExternalLabelBounds.bind(textRenderer);
      textRenderer.getExternalLabelBounds=(bounds,text)=>{
        const owner=bounds.labelTarget||bounds;if(!owner.businessObject)return nativeBounds(bounds,text);
        const style=readStyle(owner),dimensions=textRenderer.getDimensions(text,{box:{width:Math.max(bounds.width,90),height:30},style:{...textRenderer.getExternalStyle(),fontSize:style.fontSize??14,fontWeight:style.bold?'bold':'normal'}});
        return{x:Math.round(bounds.x+bounds.width/2-dimensions.width/2),y:bounds.y,width:Math.ceil(dimensions.width),height:Math.ceil(dimensions.height)};
      };
    }
    return{readStyle,readRouting,applyStyle,defaultFont,decorate,describeText,fitPlan,fitText:(element,options={})=>{const plan=fitPlan(element,options);stack.execute('nara.visual.fitText',{element,options,plan});return element;},orthogonal,manualRoute,compactContainer,shareConnection,activity};
  }
  function create(modeler){const existing=modeler.get('naraVisual',false);if(existing)return existing;if(!instances.has(modeler))instances.set(modeler,build(modeler));return instances.get(modeler);}
  function Service(injector){return build({get:(name,strict)=>injector.get(name,strict)});}Service.$inject=['injector'];
  window.NaraVisual={create,activity,installHistoryGuards,orthogonalizeWaypoints};
  window.NaraVisualModule={__init__:['naraVisual'],naraVisual:['type',Service]};
})();
