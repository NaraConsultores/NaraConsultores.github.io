'use strict';
(() => {
  const error = (code,message) => Object.assign(new Error(message),{code});
  const id = prefix => prefix + '_' + crypto.randomUUID().replaceAll('-','');
  const clone = value => JSON.parse(JSON.stringify(value));
  const cards = ['1','0..1','N','0..N'];
  const text = (value,label,max=120) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw error('ER_INVALID',label+' debe tener entre 1 y '+max+' caracteres.'); return value.trim(); };
  const number = (value,label) => { if (!Number.isFinite(value) || Math.abs(value)>100000) throw error('ER_INVALID',label+' no es válido.'); return value; };
  const table = (model,tableId) => { const value=model.tables.find(t=>t.id===tableId); if(!value)throw error('ER_NOT_FOUND','No existe esa tabla en la hoja activa.');return value; };
  const field = (model,tableId,fieldId) => { const value=table(model,tableId).fields.find(f=>f.id===fieldId);if(!value)throw error('ER_NOT_FOUND','No existe ese campo en la tabla.');return value; };
  const height = entity => 34 + Math.max(1,entity.fields.length) * 30 + 28;
  function visualStyle(value={}) {
    const result={};
    for(const key of ['fill','stroke','fontColor'])if(value[key]!==undefined){if(!/^#[0-9a-f]{6}$/i.test(value[key]))throw error('STYLE_INVALID','El color debe tener formato hexadecimal.');result[key]=value[key];}
    for(const [key,min,max]of [['strokeWidth',.5,6],['fontSize',9,32]])if(value[key]!==undefined){if(!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw error('STYLE_INVALID','Tamaño de estilo fuera de rango.');result[key]=value[key];}
    if(value.bold!==undefined){if(typeof value.bold!=='boolean')throw error('STYLE_INVALID','Negrita no válida.');result.bold=value.bold;}
    if(value.align!==undefined){if(!['left','center','right'].includes(value.align))throw error('STYLE_INVALID','Alineación no válida.');result.align=value.align;}
    return result;
  }
  function validate(model) {
    if (!model || model.version!==1 || !Array.isArray(model.tables) || !Array.isArray(model.relationships)) throw error('ER_FORMAT','Formato de modelo de datos no compatible. Se conserva el archivo original.');
    text(model.id,'ID'); text(model.name,'Nombre de hoja');
    if(model.tables.length>500 || model.relationships.length>2000)throw error('ER_LIMIT','La hoja supera 500 tablas o 2000 relaciones.');
    if(model.tables.reduce((n,t)=>n+(t.fields?.length||0),0)>10000||JSON.stringify(model).length>2*1024*1024)throw error('ER_LIMIT','El modelo supera 10000 campos o 2 MB. Divide el modelo en varias hojas.');
    const used=new Set([model.id]);
    const unique = value => {text(value,'ID',200);if(used.has(value))throw error('ER_INVALID','Hay IDs duplicados en el modelo.');used.add(value);};
    for (const t of model.tables) {
      unique(t.id);text(t.name,'Nombre de tabla');number(t.x,'Posición X');number(t.y,'Posición Y');number(t.width,'Ancho');
      if(t.width<200 || t.width>1000 || !Array.isArray(t.fields) || t.fields.length>250)throw error('ER_INVALID','La tabla requiere ancho de 200–1000 y hasta 250 campos.');
      visualStyle(t.style);const names=new Set();
      for(const f of t.fields){unique(f.id);text(f.name,'Nombre de campo');text(f.dataType,'Tipo de dato',80);if(names.has(f.name.toLocaleLowerCase()))throw error('ER_INVALID','Los nombres de campo deben ser únicos en cada tabla.');names.add(f.name.toLocaleLowerCase());for(const key of ['primaryKey','foreignKey','nullable'])if(typeof f[key]!=='boolean')throw error('ER_INVALID','Las opciones PK, FK y nulo deben ser booleanas.');}
    }
    for(const r of model.relationships){visualStyle(r.style);unique(r.id);field(model,r.sourceTableId,r.sourceFieldId);field(model,r.targetTableId,r.targetFieldId);if(r.sourceFieldId===r.targetFieldId)throw error('ER_INVALID','Elige dos campos distintos para la relación.');if(!cards.includes(r.sourceCardinality)||!cards.includes(r.targetCardinality))throw error('ER_INVALID','Cardinalidad no válida.');if(r.label && (typeof r.label!=='string'||r.label.length>120))throw error('ER_INVALID','Nombre de relación no válido.');}
    return model;
  }
  function empty(name) { return {version:1,id:id('ERD'),name:text(name,'Nombre de hoja'),tables:[],relationships:[]}; }
  function duplicate(original,name){
    const model=clone(validate(original)),ids=new Map(),fresh=old=>{if(!ids.has(old))ids.set(old,id('ER'));return ids.get(old);};model.id=fresh(model.id);model.name=text(name,'Nombre de hoja');
    for(const table of model.tables){table.id=fresh(table.id);for(const field of table.fields)field.id=fresh(field.id);}
    for(const relation of model.relationships){relation.id=fresh(relation.id);for(const key of ['sourceTableId','targetTableId','sourceFieldId','targetFieldId'])relation[key]=fresh(relation[key]);}
    return validate(model);
  }
  function makeField(input={}) {return {id:input.id||id('Field'),name:text(input.name||'id','Nombre de campo'),dataType:text(input.dataType||'bigint','Tipo de dato',80),primaryKey:!!input.primaryKey,foreignKey:!!input.foreignKey,nullable:input.nullable===undefined?!input.primaryKey:!!input.nullable};}
  function apply(original,op) {
    const model=clone(validate(original));let affectedId;
    if(op.type==='erd_table_create'){
      const name=text(op.name||'Tabla '+(model.tables.length+1),'Nombre de tabla');
      const entity={id:id('Table'),name,x:number(op.x,'Posición X'),y:number(op.y,'Posición Y'),width:op.width??300,fields:(op.fields||[{name:'id',dataType:'bigint',primaryKey:true,nullable:false}]).map(makeField)};
      model.tables.push(entity);affectedId=entity.id;
    }else if(op.type==='erd_table_update'){
      const entity=table(model,op.tableId);for(const key of ['name','x','y','width'])if(op[key]!==undefined)entity[key]=op[key];affectedId=entity.id;
    }else if(op.type==='erd_field_upsert'){
      const entity=table(model,op.tableId);const existing=op.fieldId?field(model,op.tableId,op.fieldId):null;
      if(existing){for(const key of ['name','dataType','primaryKey','foreignKey','nullable'])if(op[key]!==undefined)existing[key]=op[key];affectedId=existing.id;}
      else{const added=makeField(op);entity.fields.push(added);affectedId=added.id;}
    }else if(op.type==='erd_field_move'){
      const entity=table(model,op.tableId),index=entity.fields.findIndex(f=>f.id===op.fieldId);field(model,op.tableId,op.fieldId);
      if(!['up','down'].includes(op.direction))throw error('ER_INVALID','Dirección de campo no válida.');
      const next=index+(op.direction==='up'?-1:1);if(next>=0&&next<entity.fields.length)[entity.fields[index],entity.fields[next]]=[entity.fields[next],entity.fields[index]];affectedId=op.fieldId;
    }else if(op.type==='style'){
      const target=model.tables.find(t=>t.id===op.elementId)||model.relationships.find(r=>r.id===op.elementId);if(!target)throw error('ER_NOT_FOUND','Selecciona una tabla o relación.');target.style={...target.style,...visualStyle(op.style)};affectedId=target.id;
    }else if(op.type==='erd_field_delete'){
      const entity=table(model,op.tableId);field(model,op.tableId,op.fieldId);entity.fields=entity.fields.filter(f=>f.id!==op.fieldId);model.relationships=model.relationships.filter(r=>r.sourceFieldId!==op.fieldId&&r.targetFieldId!==op.fieldId);affectedId=entity.id;
    }else if(op.type==='erd_relationship_create'||op.type==='erd_relationship_update'){
      const existing=op.type==='erd_relationship_update'?model.relationships.find(r=>r.id===op.relationshipId):null;
      if(op.type==='erd_relationship_update'&&!existing)throw error('ER_NOT_FOUND','No existe esa relación.');
      const relation=existing||{id:id('Relation'),sourceCardinality:'1',targetCardinality:'N',label:''};
      for(const key of ['sourceTableId','sourceFieldId','targetTableId','targetFieldId','sourceCardinality','targetCardinality','label'])if(op[key]!==undefined)relation[key]=op[key];
      if(model.relationships.some(r=>r.id!==relation.id&&r.sourceFieldId===relation.sourceFieldId&&r.targetFieldId===relation.targetFieldId))throw error('ER_INVALID','Ya existe una relación entre esos campos.');
      field(model,relation.sourceTableId,relation.sourceFieldId);field(model,relation.targetTableId,relation.targetFieldId).foreignKey=true;
      if(!existing)model.relationships.push(relation);affectedId=relation.id;
    }else if(op.type==='erd_delete'){
      const entity=model.tables.find(t=>t.id===op.elementId),relation=model.relationships.find(r=>r.id===op.elementId);
      if(!entity&&!relation)throw error('ER_NOT_FOUND','Selecciona una tabla o relación.');
      model.tables=model.tables.filter(t=>t.id!==op.elementId);model.relationships=model.relationships.filter(r=>r.id!==op.elementId&&r.sourceTableId!==op.elementId&&r.targetTableId!==op.elementId);
    }else throw error('ER_OPERATION','Operación de modelo de datos no admitida.');
    validate(model);return {model,affectedId};
  }
  globalThis.NaraERModel=Object.freeze({empty,apply,validate,clone,duplicate,height,table,field,cards,visualStyle});
  globalThis.NaraERModdle={name:'Nara',uri:'https://naralab.io/schema/diagrams/1',prefix:'nara',xml:{tagAlias:'lowerCase'},types:[{name:'EntityRelationship',superClass:['Element'],properties:[{name:'id',isAttr:true,type:'String'},{name:'name',isAttr:true,type:'String'},{name:'version',isAttr:true,type:'String'},{name:'json',isBody:true,type:'String'}]},{name:'VisualStyle',superClass:['Element'],properties:[{name:'json',isBody:true,type:'String'}]},{name:'ConnectionRouting',superClass:['Element'],properties:[{name:'json',isBody:true,type:'String'}]}]};
})();
