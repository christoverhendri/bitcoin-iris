import type {LiveTradeSnapshot} from './liveTrades';
export function hydratedLiveView(snapshot:LiveTradeSnapshot|null,transport:string,hydrated:boolean){
  return hydrated?{snapshot,transport}:{snapshot:null,transport:'CONNECTING'};
}
