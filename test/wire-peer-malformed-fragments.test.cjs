// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Real TCP socket test: a malformed 21-byte trailer must be assembled from
// arbitrary data events, not accidentally certified based on chunk boundaries.
const test=require("node:test");
const assert=require("node:assert/strict");
const net=require("node:net");
const crypto=require("node:crypto");
const {once}=require("node:events");
const {setTimeout:delay}=require("node:timers/promises");
const {createWirePeer}=require("../lib/wire-peer.cjs");
const loopback="127.0.0.1";
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const cotpDisconnect=Buffer.from("0300000b06800000000000","hex");
const zeros=Buffer.alloc(21);

async function waitUntil(predicate,what){
 const expires=Date.now()+2200;
 while(Date.now()<expires){
  if(predicate())return;
  await delay(15);
 }
 throw Error("Timed out waiting for "+what);
}
async function exercise(parts) {
 const observed=[];
 const server=net.createServer(socket=>{
  socket.on("error",()=>{});
  socket.on("data",b=>observed.push(Buffer.from(b)));
 });
 const sockset=new Set();
 server.on("connection",s=>{sockset.add(s);s.once("close",()=>sockset.delete(s));});
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,loopback,resolve);
 });
 const peer=await createWirePeer(server.address().port);
 const client=net.createConnection({host:loopback,port:peer.port});
 client.on("error",()=>{});
 try {
  await once(client,"connect");
  client.write(cotpDisconnect);
  await delay(35);
  for(let i=0;i<parts.length;i++){
   if(i===parts.length-1)client.end(parts[i]);
   else client.write(parts[i]);
   if(i<parts.length-1)await delay(45);
  }
  await waitUntil(()=>peer.invalidTpkt.length===1,"one malformed trailer observation");
  await waitUntil(()=>peer.active.size===0,"clean transport closure");
  return {
   anomalies:peer.invalidTpkt.map(x=>({...x})),
   errors:[...peer.errors],
   disconnects:peer.cotpDisconnectRequests,
   sent:Buffer.concat(observed),
  };
 }finally{
  client.destroy();
  await peer.close();
  for(const s of sockset)s.destroy();
  await new Promise(resolve=>server.close(resolve));
 }
}
test("unsplit and 4+17 TCP events produce identical exact malformed trailer bytes",async()=>{
 const joined=await exercise([zeros]);
 const fragmented=await exercise([zeros.subarray(0,4),zeros.subarray(4)]);
 for(const r of [joined,fragmented]){
  assert.equal(r.disconnects,1,"actual framed COTP Disconnect observed");
  assert.equal(r.anomalies.length,1,"only one terminal invalid-TCP record");
  assert.equal(r.errors.length,1);
  assert.equal(r.anomalies[0].direction,"client-to-fixture");
  assert.equal(r.anomalies[0].byteCount,21);
  assert.equal(r.anomalies[0].allZero,true);
  assert.equal(r.anomalies[0].afterCotpDisconnect,true);
  assert.equal(r.anomalies[0].sha256,hash(zeros));
  assert.equal(r.anomalies[0].truncated,false);
  assert.ok(["TCP_FIN","TCP_CLOSE"].includes(r.anomalies[0].termination));
  assert.deepEqual(r.sent,cotpDisconnect,"never forward malformed tail to fixture");
 }
 assert.deepEqual(joined.anomalies,fragmented.anomalies);
});
test("2+2+17 fragmented client trailer still has exact 21-byte SHA256",async()=>{
 const r=await exercise([zeros.subarray(0,2),zeros.subarray(2,4),zeros.subarray(4)]);
 assert.equal(r.anomalies.length,1);
 assert.equal(r.anomalies[0].byteCount,21);
 assert.equal(r.anomalies[0].sha256,hash(zeros));
 assert.deepEqual(r.sent,cotpDisconnect);
});
test("wrong byte at end of fragmented trailer remains red; it cannot be merged into zero fingerprint",async()=>{
 const wrong=Buffer.from(zeros);wrong[20]=0x41;
 const r=await exercise([wrong.subarray(0,4),wrong.subarray(4)]);
 assert.equal(r.anomalies.length,1);
 assert.equal(r.anomalies[0].byteCount,21);
 assert.equal(r.anomalies[0].allZero,false);
 assert.notEqual(r.anomalies[0].sha256,hash(zeros));
 assert.deepEqual(r.sent,cotpDisconnect);
});
