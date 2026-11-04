'use strict';
// Three-way document merge. The committed remote value wins an ambiguous edit;
// the caller MUST preserve the complete local snapshot before applying conflicts.
(() => {
  const BPMN='http://www.omg.org/spec/BPMN/20100524/MODEL',NARA='https://naralab.io/schema/diagrams/1';
  const problem=message=>Object.assign(new Error(message),{code:'MERGE_INVALID'});
  const children=node=>Array.from(node?.childNodes||[]);
  const elements=node=>children(node).filter(n=>n.nodeType===1);
  const name=node=>node?`{${node.namespaceURI||''}}${node.localName||node.nodeName}`:'';
  const attrs=node=>new Map(Array.from(node?.attributes||[]).map(a=>[name(a),a]));
  const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function parse(xml){
    if(typeof xml!=='string'||xml.length>8*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw problem('El documento no admite combinación automática.');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(!doc?.documentElement||doc.getElementsByTagName('parsererror').length||doc.documentElement.namespaceURI!==BPMN||doc.documentElement.localName!=='definitions')throw problem('Se necesita un BPMN válido para combinar.');
    let count=0;const ids=new Set();
    const visit=(node,depth)=>{if(++count>100000||depth>100)throw problem('El documento supera el límite de combinación.');const id=node.getAttribute('id');if(id){if(ids.has(id))throw problem('El documento contiene IDs duplicados.');ids.add(id);}for(const child of elements(node))visit(child,depth+1);};
    visit(doc.documentElement,0);return doc;
  }
  function merge(baseXml,localXml,remoteXml){
    const base=parse(baseXml),local=parse(localXml),remote=parse(remoteXml),conflicts=[],cache=new WeakMap();let canonicalBytes=0;
    const copy=node=>node?remote.importNode(node,true):null;
    const canon=node=>{
      if(!node)return'';if(cache.has(node))return cache.get(node);
      const hasElements=node.nodeType===1&&elements(node).length>0;
      const encode=value=>`${value.length}:${value}`;
      const value=node.nodeType===1?'E'+encode(name(node))+encode(stable([...attrs(node)].map(([key,a])=>[key,a.value]).sort(([a],[b])=>a.localeCompare(b))))+children(node).filter(n=>!(hasElements&&n.nodeType===3&&!n.nodeValue.trim())).map(canon).join('')+'e':'N'+(node.nodeType===4?3:node.nodeType)+encode(node.nodeValue||'');
      canonicalBytes+=value.length;if(canonicalBytes>64*1024*1024)throw problem('El documento supera el límite de combinación en memoria.');
      cache.set(node,value);return value;
    };
    const conflict=path=>{if(conflicts.length<200)conflicts.push({path});};
    function choose(b,l,r,path,equal=(a,z)=>stable(a)===stable(z)){
      if(equal(l,r))return l;if(equal(b,l))return r;if(equal(b,r))return l;conflict(path);return r;
    }
    function order(b,l,r,path){
      const ls=new Set(l),rs=new Set(r),common=b.filter(k=>ls.has(k)&&rs.has(k)),cs=new Set(common);
      const lCommon=l.filter(k=>cs.has(k)),rCommon=r.filter(k=>cs.has(k));
      const localMoved=stable(lCommon)!==stable(common),remoteMoved=stable(rCommon)!==stable(common);
      if(localMoved&&remoteMoved&&stable(lCommon)!==stable(rCommon))conflict(path+'/order');
      const result=localMoved&&!remoteMoved?l:r,other=localMoved&&!remoteMoved?r:l,known=new Set(result),before=new Map();let pending=[];
      for(const key of other)if(known.has(key)){if(pending.length){before.set(key,pending);pending=[];}}else pending.push(key);
      return result.flatMap(key=>[...(before.get(key)||[]),key]).concat(pending);
    }
    function json(b,l,r,path){
      if(stable(l)===stable(r)||stable(b)===stable(l)||stable(b)===stable(r))return choose(b,l,r,path);
      if(b&&l&&r&&typeof b==='object'&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(b)&&!Array.isArray(l)&&!Array.isArray(r)){
        const result={};
        // Position/size is one operation; don't synthesize a third location.
        const geometry=['x','y','width','height'].filter(k=>k in b||k in l||k in r);
        if(geometry.length){const box=v=>Object.fromEntries(geometry.filter(k=>k in v).map(k=>[k,v[k]]));Object.assign(result,choose(box(b),box(l),box(r),path+'/position'));}
        for(const key of new Set([...Object.keys(r),...Object.keys(l),...Object.keys(b)]))if(!geometry.includes(key)){
          const value=json(b[key],l[key],r[key],path+'/'+key);if(value!==undefined)Object.defineProperty(result,key,{value,enumerable:true,configurable:true,writable:true});
        }return result;
      }
      if([b,l,r].every(v=>Array.isArray(v)&&v.every(x=>x&&typeof x.id==='string')&&new Set(v.map(x=>x.id)).size===v.length)){
        const maps=[b,l,r].map(v=>new Map(v.map(x=>[x.id,x]))),keys=[b,l,r].map(v=>v.map(x=>x.id));
        return order(...keys,path).map(key=>json(...maps.map(m=>m.get(key)),path+'/'+key)).filter(v=>v!==undefined);
      }
      return choose(b,l,r,path);
    }
    function groups(node){
      const result=new Map();
      for(const child of elements(node)){
        const id=child.getAttribute('id'),reference=child.namespaceURI===BPMN&&['incoming','outgoing','flowNodeRef','source','target'].includes(child.localName);
        const key=id?'id:'+id:name(child)+(reference?'='+child.textContent.trim():'');
        if(!result.has(key))result.set(key,[]);result.get(key).push(child);
      }return result;
    }
    function node(b,l,r,path){
      if(canon(l)===canon(r))return copy(l);if(canon(b)===canon(l))return copy(r);if(canon(b)===canon(r))return copy(l);
      if(!b||!l||!r||name(b)!==name(l)||name(b)!==name(r)){conflict(path);return copy(r);}
      const out=r.cloneNode(false),maps=[b,l,r].map(attrs);
      for(const a of Array.from(out.attributes))out.removeAttributeNode(a);
      const isBounds=r.localName==='Bounds'&&r.namespaceURI==='http://www.omg.org/spec/DD/20100524/DC';
      const geometry=isBounds?['x','y','width','height']:[];
      const box=n=>Object.fromEntries(geometry.map(k=>[k,n.getAttribute(k)]));
      const mergedBox=isBounds?choose(box(b),box(l),box(r),path+'/position'):null;
      for(const key of new Set(maps.flatMap(m=>[...m.keys()]))){
        const values=maps.map(m=>m.get(key));
        const value=choose(...values,path+'/@'+(values.find(Boolean)?.localName||key),(a,z)=>a?.value===z?.value);
        if(value)out.setAttributeNS(value.namespaceURI,value.name,geometry.includes(value.localName)?mergedBox[value.localName]:value.value);
      }
      if(r.namespaceURI===NARA&&['entityRelationship','visualStyle'].includes(r.localName)){
        try{const value=json(...[b,l,r].map(n=>JSON.parse(n.textContent)),path+'/json');if(r.localName==='entityRelationship'){globalThis.NaraERModel?.validate(value);if(value.id!==out.getAttribute('id'))throw problem('ID ER incompatible.');}out.appendChild(remote.createTextNode(JSON.stringify(value)));return out;}
        catch{conflict(path+'/extension');return copy(r);}
      }
      const lists=[b,l,r].map(elements);
      const mixed=[b,l,r].some(n=>elements(n).length&&children(n).some(c=>c.nodeType!==1&&(c.nodeType!==3||c.nodeValue.trim())));
      if(!lists.some(v=>v.length)||mixed){
        const text=choose(...[b,l,r].map(n=>children(n).map(canon).join('')),path+'/content');
        const chosen=[l,r,b].find(n=>children(n).map(canon).join('')===text);for(const c of children(chosen))out.appendChild(copy(c));return out;
      }
      const gs=[b,l,r].map(groups),keys=gs.map(g=>[...g.keys()]);
      for(const key of order(...keys,path)){
        const values=gs.map(g=>g.get(key)||[]);
        if(values.some(v=>v.length>1)){
          const chosen=choose(...values,path+'/'+key,(a,z)=>a.map(canon).join('')===z.map(canon).join(''));for(const c of chosen)out.appendChild(copy(c));
        }else{const child=node(...values.map(v=>v[0]),path+'/'+key);if(child)out.appendChild(child);}
      }return out;
    }
    let root=node(base.documentElement,local.documentElement,remote.documentElement,'definitions');
    function verify(root){
      const all=[root,...Array.from(root.getElementsByTagName('*'))],ids=new Set();
      for(const n of all){const id=n.getAttribute('id');if(id){if(ids.has(id))throw problem('IDs duplicados tras combinar.');ids.add(id);}}
      const refs=new Set(['sourceRef','targetRef','attachedToRef','processRef','bpmnElement','default','messageRef','signalRef','errorRef','escalationRef','activityRef','dataObjectRef','dataStoreRef']);
      for(const n of all){for(const a of Array.from(n.attributes))if(refs.has(a.localName)&&!a.namespaceURI&&a.value&&!a.value.includes(':')&&!ids.has(a.value))throw problem('Una referencia quedó sin destino.');
        if(n.namespaceURI===BPMN&&['incoming','outgoing','flowNodeRef'].includes(n.localName)&&!ids.has(n.textContent.trim()))throw problem('Una conexión quedó sin destino.');
      }
    }
    try{verify(root);}catch{conflict('definitions/structure');root=copy(remote.documentElement);verify(root);}
    const hasLocalChanges=canon(root)!==canon(remote.documentElement);
    const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
    if(xml.length>8*1024*1024)throw problem('La combinación supera 8 MB.');
    return{xml,conflicts,hasLocalChanges};
  }
  globalThis.NaraBpmnMerge=Object.freeze({merge});
})();
