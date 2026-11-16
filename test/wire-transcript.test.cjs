// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createWireTranscript,digest}=require('../lib/wire-transcript.cjs');
function packet(bytes){const b=Buffer.from(bytes);b.writeUInt16BE(b.length,2);return b;}
const cotp=packet([3,0,0,0,6,0xe0,0,0,0,0,0]);
test('a complete TPKT produces stable exact-byte digest and immutable snapshots',()=>{
 const a=createWireTranscript();const hash=a.observe('client_rx',1,cotp);
 assert.equal(hash,digest(cotp));
 const snap=a.snapshot();
 assert.equal(snap.eventCount,1);assert.equal(snap.events[0].length,cotp.length);
 assert.equal(snap.events[0].direction,'client_rx');
 snap.events[0].direction='tampered';
 assert.equal(a.snapshot().events[0].direction,'client_rx');
 const b=createWireTranscript();b.observe('client_rx',1,cotp);
 assert.deepEqual(a.snapshot(),b.snapshot());
});
test('changing a frame, direction, session or order changes chained proof',()=>{
 const altered=Buffer.from(cotp);altered[6]=1;
 const a=createWireTranscript();a.observe('client_rx',1,cotp);a.observe('client_tx',1,altered);
 const hashes=[];
 for(const entries of [[['client_rx',1,cotp],['client_tx',1,cotp]],
  [['client_tx',1,cotp],['client_rx',1,altered]],
  [['client_rx',2,cotp],['client_tx',1,altered]],
  [['client_tx',1,altered],['client_rx',1,cotp]]]){
   const b=createWireTranscript();for(const [d,s,f] of entries)b.observe(d,s,f);
   hashes.push(b.snapshot().chainSha256);
 }
 for(const h of hashes)assert.notEqual(h,a.snapshot().chainSha256);
});
test('rejects truncation, forged length, bad header and invalid metadata',()=>{
 const cases=[cotp.subarray(0,5),Buffer.alloc(0),Buffer.from(cotp),Buffer.from(cotp),Buffer.from(cotp)];
 cases[2][0]=2;cases[3][1]=1;cases[4].writeUInt16BE(123,2);
 for(const b of cases)assert.throws(()=>createWireTranscript().observe('client_rx',1,b));
 assert.throws(()=>createWireTranscript().observe('network',1,cotp));
 assert.throws(()=>createWireTranscript().observe('client_rx',0,cotp));
 assert.throws(()=>createWireTranscript().observe('client_rx',1,new Uint8Array(cotp)));
});
test('event capacity is hard failure, never truncated successful evidence',()=>{
 const t=createWireTranscript(2);t.observe('client_rx',1,cotp);t.observe('fixture_tx',1,cotp);
 assert.throws(()=>t.observe('fixture_rx',1,cotp),/WIRE_EVIDENCE_EVENT_LIMIT/);
 assert.equal(t.snapshot().eventCount,2);
 assert.throws(()=>createWireTranscript(4097));
});
