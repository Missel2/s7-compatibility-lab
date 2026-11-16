// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Hashes COMPLETE TPKT wire frames seen at the independent observer boundary.
// This is a bounded software-only transcript, NOT a PCAP or digital signature.
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const DIRECTIONS=new Set(['client_rx','fixture_rx','client_tx','fixture_tx','fixture_ack_dropped','fixture_read_withheld']);
const MAX_EVENTS=4096;
const GENESIS='0'.repeat(64);
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function createWireTranscript(maxEvents=MAX_EVENTS){
  assert.ok(Number.isSafeInteger(maxEvents)&&maxEvents>0&&maxEvents<=MAX_EVENTS);
  const events=[];
  let chain=GENESIS;
  function observe(direction,session,bytes){
    assert.ok(DIRECTIONS.has(direction),'unsupported wire direction');
    assert.ok(Number.isSafeInteger(session)&&session>0,'invalid session');
    assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=7&&bytes.length<=65535,'complete TPKT buffer required');
    assert.equal(bytes[0],3,'TPKT version');
    assert.equal(bytes[1],0,'TPKT reserved');
    assert.equal(bytes.readUInt16BE(2),bytes.length,'TPKT declared length must match actual bytes');
    if(events.length>=maxEvents)throw new Error('WIRE_EVIDENCE_EVENT_LIMIT');
    const entry={seq:events.length+1,session,direction,length:bytes.length,frameSha256:digest(bytes)};
    // Length-delimited canonical fields prevent ambiguous concatenation.
    chain=digest(Buffer.from(JSON.stringify([chain,entry.seq,entry.session,entry.direction,entry.length,entry.frameSha256])));
    events.push(Object.freeze({...entry,chainSha256:chain}));
    return entry.frameSha256;
  }
  function snapshot(){return {schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',
    evidenceType:'COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP',
    maxEvents,events:events.map(e=>({...e})),eventCount:events.length,chainSha256:chain};}
  return Object.freeze({observe,snapshot});
}
module.exports={createWireTranscript,digest};
