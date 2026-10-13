import {readTradeProfile,TradeRequestError,TradeLedgerError} from '@/lib/sources/tradeLedger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const headers={'cache-control':'no-store'};
  try{return Response.json(readTradeProfile(new URL(request.url).searchParams),{headers});}
  catch(error){return Response.json({unavailable:true,error:error instanceof Error?error.message:'Trade ledger unavailable'},{status:error instanceof TradeRequestError?400:error instanceof TradeLedgerError?503:500,headers});}
}
