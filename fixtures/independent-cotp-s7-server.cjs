// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Original, minimal independent ISO-on-TCP / COTP / S7Comm server for a
// DISPOSABLE hardcoded DB1. Not Snap7, not a production driver or PLC emulator.
// Fail closed for unsupported operations; only local ephemeral port.
const assert=require("node:assert/strict");
const net=require("node:net");
const crypto=require("node:crypto");

const host="127.0.0.1";
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const MAX_TPKT=4096,MAX_TRAILER=4096;
const values=Buffer.from(Array.from({length:2048},(_,i)=>i&0xff));
values.writeFloatBE(12.5,0);
values.writeInt16BE(-123,4);
values.writeFloatBE(3.25,8);

function tpkt(payload){
 assert.ok(Buffer.isBuffer(payload)&&payload.length>=3&&payload.length<=MAX_TPKT-4);
 const out=Buffer.alloc(4+payload.length);
 out[0]=3;out.writeUInt16BE(out.length,2);payload.copy(out,4);
 return out;
}
function s7Reply(request,params,data=Buffer.alloc(0)){
 const ref=request.readUInt16BE(11);
 const header=Buffer.alloc(12);
 header[0]=0x32;header[1]=3;
 header.writeUInt16BE(ref,4);
 header.writeUInt16BE(params.length,6);
 header.writeUInt16BE(data.length,8);
 return tpkt(Buffer.concat([Buffer.from([2,0xf0,0x80]),header,params,data]));
}
function cotpConfirm(cr){
 assert.ok(cr.length>=11&&cr[5]===0xe0&&cr[4]>=6);
 const cc=Buffer.from(cr);
 cc[5]=0xd0;
 // Destination reference in the server response is the client's CR source.
 cc.writeUInt16BE(cr.readUInt16BE(8),6);
 cc.writeUInt16BE(1,8);
 return cc;
}
function cotpDisconnectConfirm(dr){
 assert.ok(dr.length>=11&&dr[5]===0x80);
 const payload=Buffer.from([5,0xc0,0,0,0,0]);
 payload.writeUInt16BE(dr.readUInt16BE(8),2);
 payload.writeUInt16BE(dr.readUInt16BE(6),4);
 return tpkt(payload);
}
function parseReadItems(frame){
 const start=17,n=frame[start+1];
 assert.equal(frame[start],4,"READ_VAR only");
 assert.ok(n>=1&&n<=4,"Bounded number of declared READ_VAR items");
 assert.equal(frame.readUInt16BE(13),2+n*12,"Exact READ_VAR parameter size");
 const items=[];
 for(let i=0;i<n;i++){
  const offset=start+2+i*12;
  assert.equal(frame[offset],0x12,"S7ANY variable request");
  assert.equal(frame[offset+1],0x0a,"S7ANY item length");
  assert.equal(frame[offset+2],0x10,"S7ANY type");
  assert.equal(frame.readUInt16BE(offset+6),1,"Only synthetic DB1 allowed");
  assert.equal(frame[offset+8],0x84,"Only S7 DB memory area allowed");
  const bitAddress=(frame[offset+9]<<16)|(frame[offset+10]<<8)|frame[offset+11];
  assert.equal(bitAddress%8,0,"Only byte-aligned DB1 data");
  const address=bitAddress/8;
  assert.ok([0,4,8].includes(address),"No requests outside three fixed synthetic values");
  const announced=frame.readUInt16BE(offset+4);
  const type=frame[offset+3];
  const fieldSize=address===4?2:4;
  if(type!==2){
   // PLC4X 0.13.1 sends one typed element for each fixed field.
   const fieldType=address===4?0x05:0x08; // INT or REAL
   assert.equal(type,fieldType,"Unexpected S7ANY type for fixed synthetic field");
   assert.equal(announced,1,"Expected a single typed S7ANY element");
   items.push({address,size:fieldSize});
   continue;
  }
  // Published PLC4X 1.0.0 coalesces REAL0, INT4 and REAL8 into one
  // 12-byte S7ANY READ_VAR item (actual original request: 04 01 12 0a
  // 10 02 00 0c 00 01 84 00 00 00). This is NOT three S7ANY items.
  const singleContiguous=address===0&&announced===12;
  const size=singleContiguous?12:fieldSize;
  assert.ok(singleContiguous||[1,size].includes(announced),"Unsupported ANY element count");
  items.push({address,size});
 }
 assert.equal(new Set(items.map(x=>x.address)).size,items.length,"Duplicate READ_VAR items");
 return items;
}
function readReply(frame){
 const items=parseReadItems(frame);
 const data=Buffer.concat(items.map(x=>{
  const part=values.subarray(x.address,x.address+x.size);
  const b=Buffer.alloc(4+part.length);
  b[0]=0xff;b[1]=0x04;b.writeUInt16BE(part.length*8,2);part.copy(b,4);
  return b;
 }));
 return s7Reply(frame,Buffer.from([4,items.length]),data);
}
function setupReply(frame){
 const start=17;assert.equal(frame[start],0xf0,"Only SETUP_COMMUNICATION handshake allowed");
 assert.equal(frame.readUInt16BE(13),8);
 assert.equal(frame.readUInt16BE(15),0);
 const params=Buffer.from(frame.subarray(start,start+8));
 // Negotiate exactly the incoming PDU size capped to 480 bytes.
 const asked=params.readUInt16BE(6);
 assert.ok(asked>=240&&asked<=8192,"Unsupported PDU length");
 params.writeUInt16BE(Math.min(480,asked),6);
 return s7Reply(frame,params);
}
function classify(frame,phase){
 assert.equal(frame[0],3);
 assert.equal(frame.readUInt16BE(2),frame.length);
 if(frame[5]===0xe0){
  assert.equal(phase,"EXPECT_COTP_CR");
  return {next:"EXPECT_S7_SETUP",kind:"COTP_CR",response:cotpConfirm(frame)};
 }
 if(frame[5]===0x80){
  assert.equal(phase,"READY","Disconnect only after a successful S7 setup and read");
  return {next:"COTP_DISCONNECTED",kind:"COTP_DR",response:null};
 }
 assert.equal(frame[5],0xf0,"Only COTP DT/CR/DR supported");
 assert.equal(frame[4],2,"COTP data header len");
 assert.equal(frame[6],0x80,"COTP EOT");
 assert.equal(frame[7],0x32,"Classic S7 protocol identifier");
 assert.equal(frame[8],1,"Only original S7 request, never ACK or user data");
 assert.equal(frame.readUInt16BE(15),0,"Read-only client must not send WRITE data");
 if(phase==="EXPECT_S7_SETUP"){
  return {next:"READY",kind:"S7_SETUP",response:setupReply(frame)};
 }
 assert.equal(phase,"READY");
 assert.equal(frame[17],4,"WRITE_VAR is forbidden");
 return {next:"READY",kind:"S7_READ_VAR",response:readReply(frame)};
}
async function startIndependentS7Server({disconnectMode="silence",splitReadReply=false}={}){
 assert.ok(["silence","confirm"].includes(disconnectMode));
 assert.equal(typeof splitReadReply,"boolean");
 const sessions=[],sockets=new Set();
 const server=net.createServer({allowHalfOpen:true},socket=>{
  const id=sessions.length+1;
  const s={session:id,phase:"EXPECT_COTP_CR",received:[],sent:[],events:[],
   connections:0,setup:0,reads:0,writes:0,disconnects:0,
   invalidTail:null,errors:[],closed:false,sawFin:false,closeHadError:null,validRead:false,
   readReplyWrites:[]};
  sessions.push(s);sockets.add(socket);
  socket.setNoDelay(true);
  socket.setTimeout(15000,()=>{s.errors.push("SOCKET_IDLE_TIMEOUT");socket.destroy();});
  let pending=Buffer.alloc(0),unframed=false,unframedTotal=0,malformed=[],malformedTimer=null,malformedOverflow=false;
  let readReplyTimer=null;
  function observe(direction,packet){
   s.events.push({direction,length:packet.length,sha256:digest(packet)});
   assert.ok(s.events.length<=128,"Exceeded bounded wire event count");
  }
  function closeTail(origin){
   if(!unframed||s.invalidTail)return;
   if(malformedTimer)clearTimeout(malformedTimer);
   const raw=Buffer.concat(malformed);
   s.invalidTail={direction:"client-to-server",afterCotpDisconnect:s.disconnects===1,
    bytes:raw.length,sha256:digest(raw),allZero:raw.every(x=>x===0),
    rawHex:raw.toString("hex"),prefixHex:raw.subarray(0,32).toString("hex"),
    complete:origin==="TCP_FIN"||origin==="TCP_CLOSE",
    truncated:malformedOverflow,termination:origin,totalObserved:unframedTotal};
  }
  function failed(error){s.errors.push(String(error.message||error).slice(0,300));socket.destroy();}
  function send(packet,kind){
   observe("server_tx",packet);
   s.sent.push(packet.toString("hex"));
   if(kind!=="S7_READ_VAR"||!splitReadReply){
    socket.write(packet);
    return;
   }
   // Split inside the TPKT header, then inside the first DB1 value.
   // The schedule describes server writes, not TCP segment boundaries.
   const offsets=[0,2,26,packet.length];
   assert.ok(packet.length>26);
   const start=process.hrtime.bigint();
   function writePart(index){
    if(socket.destroyed)return;
    const offset=offsets[index];
    const bytes=packet.subarray(offset,offsets[index+1]);
    socket.write(bytes);
    s.readReplyWrites.push({
     offset,hex:bytes.toString("hex"),sha256:digest(bytes),
     elapsedUs:Number((process.hrtime.bigint()-start)/1000n)
    });
    readReplyTimer=index+2<offsets.length
     ?setTimeout(()=>writePart(index+1),35)
     :null;
   }
   writePart(0);
  }
  socket.on("data",chunk=>{
   try {
    if(unframed){
     unframedTotal+=chunk.length;
     if(unframedTotal>MAX_TRAILER)malformedOverflow=true;
     malformed.push(chunk.subarray(0,Math.max(0,MAX_TRAILER-(unframedTotal-chunk.length))));
     if(malformedOverflow){closeTail("SIZE_LIMIT");socket.destroy();}
     return;
    }
    pending=Buffer.concat([pending,chunk]);
    assert.ok(pending.length<=MAX_TPKT*2,"Oversize input stream");
    while(pending.length>0){
     if(pending[0]!==3){
      unframed=true;unframedTotal=pending.length;malformed=[pending.subarray(0,MAX_TRAILER)];malformedOverflow=pending.length>MAX_TRAILER;
      malformedTimer=setTimeout(()=>{closeTail("TIME_LIMIT");socket.destroy();},2000);
      if(malformedOverflow){closeTail("SIZE_LIMIT");socket.destroy();}
      return;
     }
     if(pending.length<4)break;
     assert.equal(pending[1],0);
     const len=pending.readUInt16BE(2);
     assert.ok(len>=7&&len<=MAX_TPKT,"Unbounded or invalid TPKT length");
     if(pending.length<len)break;
     assert.equal(readReplyTimer,null,"New frame before split reply completed");
     const packet=Buffer.from(pending.subarray(0,len));
     pending=pending.subarray(len);
     observe("client_rx",packet);
     s.received.push(packet.toString("hex"));
     const reply=classify(packet,s.phase);
     s.phase=reply.next;
     if(reply.kind==="COTP_CR")s.connections++;
     if(reply.kind==="S7_SETUP")s.setup++;
     if(reply.kind==="S7_READ_VAR"){s.reads++;s.validRead=true;}
     if(reply.kind==="COTP_DR")s.disconnects++;
     if(reply.response)send(reply.response,reply.kind);
     if(reply.kind==="COTP_DR"&&disconnectMode==="confirm")send(cotpDisconnectConfirm(packet));
    }
   }catch(e){failed(e)}
  });
  socket.once("end",()=>{
   s.sawFin=true;
   if(unframed)closeTail("TCP_FIN");
   else if(pending.length>0)s.errors.push("TRUNCATED_TPKT_AT_FIN");
   socket.end();
  });
  socket.once("close",hadError=>{
   if(readReplyTimer!==null){
    clearTimeout(readReplyTimer);
    s.errors.push("SPLIT_READ_REPLY_NOT_FULLY_WRITTEN");
   }
   if(unframed)closeTail("TCP_CLOSE");
   s.closeHadError=hadError;
   s.closed=true;
   sockets.delete(socket);
   if(malformedTimer)clearTimeout(malformedTimer);
  });
  socket.on("error",e=>s.errors.push("SOCKET_ERROR:"+String(e.code||e.message)));
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,host,resolve);});
 const port=server.address().port;
 assert.ok(port>=1024&&port<=65535);
 return {port,host,disconnectMode,sessions, async stop(){
  for(const s of sockets)s.destroy();
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }};
}
module.exports={startIndependentS7Server,tpkt,s7Reply,parseReadItems,classify,digest,cotpConfirm,cotpDisconnectConfirm};
