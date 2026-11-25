// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Independent, generated RFC1006/S7 test packets. No python-snap7 fixture.
// This exercises only the tiny disposable Node server, NOT a real PLC client.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const net=require("node:net");
const {setTimeout:delay}=require("node:timers/promises");
const {startIndependentS7Server,tpkt,digest}=require("../fixtures/independent-cotp-s7-server.cjs");
const {verifyHistoricalCapture}=require("../scripts/assess-plc4x-historical-close.cjs");
const {verifyReadReplyDelivery}=require("../lib/verify-split-read-reply.cjs");
const host="127.0.0.1";
const zero=Buffer.alloc(21);
function job(ref,params){
 const h=Buffer.alloc(10);h[0]=0x32;h[1]=1;h.writeUInt16BE(ref,4);h.writeUInt16BE(params.length,6);
 return tpkt(Buffer.concat([Buffer.from([2,0xf0,0x80]),h,params]));
}
function any(addr,size){
 const b=Buffer.from([0x12,0x0a,0x10,0x02,0,size,0,1,0x84,0,0,0]);
 b[9]=(addr*8)>>16;b[10]=((addr*8)>>8)&255;b[11]=(addr*8)&255;return b;
}
const cr=Buffer.from("0300001611e00000000100c1020100c2020102c0010a","hex");
const setup=job(1,Buffer.from([0xf0,0,0,1,0,1,1,0xe0]));
const read=job(2,Buffer.concat([Buffer.from([4,3]),any(0,4),any(4,2),any(8,4)]));
const dr=Buffer.from("0300000b06800000000000","hex");
async function session({mode="silence",parts=[],readFrame=read,writeAfter=false,sendDisconnect=true,splitReadReply=false}={}){
 const fixture=await startIndependentS7Server({disconnectMode:mode,splitReadReply});
 const socket=net.createConnection({host,port:fixture.port});
 socket.on("error",()=>{});
 let buffer=Buffer.alloc(0);const responses=[];
 socket.on("data",b=>{
  buffer=Buffer.concat([buffer,b]);
  while(buffer.length>=4&&buffer[0]===3){
   const n=buffer.readUInt16BE(2);if(buffer.length<n)break;
   responses.push(Buffer.from(buffer.subarray(0,n)));buffer=buffer.subarray(n);
  }
 });
 async function wait(fn,what){
  const end=Date.now()+1500;
  while(Date.now()<end){if(fn())return;await delay(15);}
  throw Error("No response "+what);
 }
 try{
  await wait(()=>!socket.connecting,"TCP connect");
  socket.write(cr);
  await wait(()=>responses.length>=1,"COTP CC");
  socket.write(setup);
  await wait(()=>responses.length>=2,"S7 setup ACK");
  socket.write(readFrame);
  if(!writeAfter)await wait(()=>responses.length>=3,"S7 READ_VAR ACK");
  if(!writeAfter){
   if(sendDisconnect){
    socket.write(dr);
    await delay(45);
   }
   if(parts.length){
    for(let i=0;i<parts.length;i++){
     if(i===parts.length-1)socket.end(parts[i]);
     else socket.write(parts[i]);
     if(i<parts.length-1)await delay(35);
    }
   } else socket.end();
  }
  await wait(()=>fixture.sessions[0]?.closed,"fixture TCP close");
  return {record:structuredClone(fixture.sessions[0]),frames:responses.map(x=>Buffer.from(x))};
 }finally{socket.destroy();await fixture.stop();}
}
test("standalone peer implements COTP CC, S7 setup, exact 3-item synthetic DB1 READ_VAR",async()=>{
 const x=await session();
 assert.equal(x.frames[0][5],0xd0,"genuine COTP confirmation");
 assert.equal(x.frames[1][8],3,"genuine S7 ACKDATA for setup");
 assert.equal(x.frames[1][19],0xf0,"S7 ACKDATA has a 12-byte header, then setup parameter");
 const r=x.frames[2];
 assert.equal(r[8],3);assert.equal(r[19],4);assert.equal(r[20],3);
 const data=r.subarray(21);
 assert.equal(data.subarray(0,4).toString("hex"),"ff040020");
 assert.equal(data.readFloatBE(4),12.5);
 assert.equal(data.subarray(8,12).toString("hex"),"ff040010");
 assert.equal(data.readInt16BE(12),-123);
 assert.equal(data.subarray(14,18).toString("hex"),"ff040020");
 assert.equal(data.readFloatBE(18),3.25);
 assert.deepEqual([x.record.connections,x.record.setup,x.record.reads,x.record.writes,x.record.disconnects],[1,1,1,0,1]);
 assert.equal(x.record.errors.length,0);
 assert.equal(x.record.invalidTail,null);
 assert.equal(x.record.closed,true);
 assert.ok(x.record.events.length>=7);
});
test("real published PLC4X one-item contiguous DB1[0:12] request returns all exact raw bytes",async()=>{
 // Captured from actual PLC4X 1.0.0 Java process in CI #44049739091.
 const coalesced=Buffer.from("0300001f02f08032010000000b000e00000401120a1002000c000184000000","hex");
 const x=await session({readFrame:coalesced});
 const ack=x.frames[2];
 assert.equal(ack[19],4);
 assert.equal(ack[20],1);
 assert.equal(ack.subarray(21,25).toString("hex"),"ff040060");
 assert.equal(ack.subarray(25).toString("hex"),"41480000ff85060740500000");
 assert.equal(x.record.reads,1);
 assert.equal(x.record.writes,0);
 assert.equal(x.record.errors.length,0);
});
test("historical PLC4X typed REAL/INT/REAL request reads the same synthetic fields",async()=>{
 const request=Buffer.from(
  "0300003702f08032010000000a002600000403120a10080001000184000000120a10050001000184000020120a10080001000184000040",
  "hex");
 const {frames,record}=await session({readFrame:request,sendDisconnect:false});
 assert.equal(frames[2].readUInt16BE(11),request.readUInt16BE(11));
 assert.equal(frames[2].subarray(19).toString("hex"),"0403ff04002041480000ff040010ff85ff04002040500000");
 assert.equal(record.reads,1);
 assert.deepEqual(record.errors,[]);
 const head="a".repeat(40);
 const stdout=Buffer.from(JSON.stringify({version:"0.13.1",sourceCommit:head,
  observed:{real0:12.5,int4:-123,real8:3.25}}));
 const stderr=Buffer.alloc(0);
 const capture={
  version:"0.13.1", sourceCommit:head, driver:"org.apache.plc4x:plc4j-driver-s7:0.13.1", splitReadReply:false,
  driverJarSha256:"7be84d58e3f06666df63ed64e55821153bf663c3d4c5855d846a7617b0dcc89a",
  fixtureSourceSha256:digest(fs.readFileSync(require.resolve("../fixtures/independent-cotp-s7-server.cjs"))),
  java:{code:0,signal:null,timedOut:false,truncated:false,stdoutSha256:digest(stdout),stderrSha256:digest(stderr)},
  sessions:[record]
 };
 const observation=verifyHistoricalCapture(capture,stdout,stderr);
 assert.equal(observation.outcome,"NOT_OBSERVED_UNSAFE");
 assert.equal(observation.drDcExercised,false);
 for(const change of [{sawFin:false},{disconnects:1},{invalidTail:{bytes:1}},
  {events:record.events.slice(0,-1)}]){
  assert.throws(()=>verifyHistoricalCapture({...capture,sessions:[{...record,...change}]},stdout,stderr));
 }
 const wrongCount=Buffer.from(request);
 wrongCount.writeUInt16BE(2,23);
 const rejected=await session({readFrame:wrongCount,writeAfter:true});
 assert.equal(rejected.record.reads,0);
 assert.match(rejected.record.errors[0],/single typed S7ANY element/);
});
test("split read response retains the exact normal frame and measured write delays",async()=>{
 const normal=await session();
 const split=await session({splitReadReply:true});
 assert.deepEqual(split.frames,normal.frames);
 assert.deepEqual(split.record.errors,[]);
 const writes=split.record.readReplyWrites;
 assert.deepEqual(verifyReadReplyDelivery(split.frames[2],writes,true),[2,24,17]);
 for(const change of [{elapsedUs:writes[0].elapsedUs},{hex:"00"},{offset:3}]){
  const forged=[writes[0],{...writes[1],...change},writes[2]];
  assert.throws(()=>verifyReadReplyDelivery(split.frames[2],forged,true));
 }
 assert.throws(()=>verifyReadReplyDelivery(split.frames[2],writes.slice(0,2),true));
 assert.throws(()=>verifyReadReplyDelivery(split.frames[2],writes,false));
});
test("independent second server observes all 21 malformed bytes, not just the first TCP event",async()=>{
 const joined=await session({parts:[zero]});
 const split=await session({parts:[zero.subarray(0,4),zero.subarray(4)]});
 const triple=await session({parts:[zero.subarray(0,2),zero.subarray(2,4),zero.subarray(4)]});
 for(const x of [joined,split,triple]){
  const a=x.record.invalidTail;
  assert.ok(a,"missing true unframed trailer");
  assert.equal(a.direction,"client-to-server");
  assert.equal(a.bytes,21);
  assert.equal(a.totalObserved,21);
  assert.equal(a.sha256,digest(zero));
  assert.equal(a.allZero,true);
  assert.equal(a.afterCotpDisconnect,true);
  assert.equal(a.truncated,false);
  assert.equal(a.complete,true);
  assert.equal(x.record.writes,0);
  assert.equal(x.record.errors.length,0);
 }
});
test("bad trailer byte does not inherit known-unsafe zero fingerprint",async()=>{
 const bad=Buffer.from(zero);bad[20]=0x5a;
 const x=await session({parts:[bad.subarray(0,4),bad.subarray(4)]});
 assert.equal(x.record.invalidTail.bytes,21);
 assert.equal(x.record.invalidTail.allZero,false);
 assert.notEqual(x.record.invalidTail.sha256,digest(zero));
});
test("unsupported S7 WRITE_VAR and wrong DB1 address never become successful observations",async()=>{
 const denied=job(5,Buffer.from([5,1,...any(8,4)]));
 const x=await session({readFrame:denied,writeAfter:true});
 assert.equal(x.record.reads,0);
 assert.equal(x.record.writes,0);
 assert.ok(x.record.errors.some(e=>/READ_VAR only|WRITE_VAR/.test(e)));
});
test("optionally send correct real COTP Disconnect Confirm under separate server policy",async()=>{
 const x=await session({mode:"confirm"});
 assert.equal(x.frames[3][5],0xc0);
 assert.equal(x.frames[3].readUInt16BE(2),10);
 assert.equal(x.record.disconnects,1);
 assert.equal(x.record.errors.length,0);
});
