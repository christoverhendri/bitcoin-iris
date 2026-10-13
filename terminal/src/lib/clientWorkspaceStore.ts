'use client';
const temporary = new Map<string,string>();

export function readWorkspace(key:string,fallback:string){
  if(temporary.has(key))return temporary.get(key)!;
  try{return localStorage.getItem(key)??fallback;}catch{return fallback;}
}
export function writeWorkspace(key:string,value:string){
  let persisted=true;
  try{localStorage.setItem(key,value);temporary.delete(key);}catch{temporary.set(key,value);persisted=false;}
  window.dispatchEvent(new CustomEvent('iris-workspace-change',{detail:key}));
  return persisted;
}
export function subscribeWorkspace(key:string,callback:()=>void){
  const stored=(event:StorageEvent)=>{if(event.key===key||event.key===null)callback();};
  const changed=(event:Event)=>{if((event as CustomEvent).detail===key)callback();};
  window.addEventListener('storage',stored);window.addEventListener('iris-workspace-change',changed);
  return()=>{window.removeEventListener('storage',stored);window.removeEventListener('iris-workspace-change',changed);};
}
