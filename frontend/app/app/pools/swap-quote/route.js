import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress } from 'viem';

const ARC_CHAIN_ID = 5042002;
const SWAP_ROUTER = '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A';
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const ABI = [{ type:'function', name:'getAmountsOut', stateMutability:'view', inputs:[{type:'uint256'},{type:'address[]'}], outputs:[{type:'uint256[]'}] }];
const FACTORY_ABI = [{ type:'function', name:'getPair', stateMutability:'view', inputs:[{type:'address'},{type:'address'}], outputs:[{type:'address'}] }];

function getClient(){
  const urls=[process.env.ARC_RPC_URL,process.env.NEXT_PUBLIC_ARC_RPC_URL,'https://rpc.testnet.arc.network','https://rpc.drpc.testnet.arc.network','https://rpc.quicknode.testnet.arc.network','https://rpc.blockdaemon.testnet.arc.network'].filter(Boolean);
  return createPublicClient({chain:defineChain({id:ARC_CHAIN_ID,name:'Arc Testnet',nativeCurrency:{name:'USD Coin',symbol:'USDC',decimals:6},rpcUrls:{default:{http:urls}}}),transport:fallback(urls.map(url=>http(url)),{rank:true})});
}

export async function POST(request){
  try{
    const body=await request.json(); const amountIn=BigInt(String(body?.amountIn||'0')); const path=Array.isArray(body?.path)?body.path:[];
    if(amountIn<=0n||path.length!==2) return NextResponse.json({success:false,error:'Invalid swap quote request.'},{status:400});
    const tokenIn=getAddress(path[0]); const tokenOut=getAddress(path[1]); const client=getClient();
    const pair=await client.readContract({address:FACTORY,abi:FACTORY_ABI,functionName:'getPair',args:[tokenIn,tokenOut]});
    if(!pair||pair==='0x0000000000000000000000000000000000000000') return NextResponse.json({success:false,error:'No liquidity pool exists for this pair.'},{status:404});
    const amounts=await client.readContract({address:SWAP_ROUTER,abi:ABI,functionName:'getAmountsOut',args:[amountIn,[tokenIn,tokenOut]]});
    return NextResponse.json({success:true,data:{outputAmount:String(amounts[amounts.length-1]||0n),pair}});
  }catch(error){return NextResponse.json({success:false,error:error?.shortMessage||error?.message||'Unable to quote this UnitFlow pool swap.'},{status:502});}
}
