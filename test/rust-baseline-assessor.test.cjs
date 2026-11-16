"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {verifyWrongPdu,verifyWriteAndLifecycle,verifyGoodRead}=require("../scripts/assess-rust-v1.4.0.cjs");
test("negative control: wrong-ref evidence needs real wire mutation and false fresh data",()=>{
  const legitimate={engine:"rust",pkg:"1.4.0",nodeRed:"5.0.9",fault:"wrong_pdu_reference",
    verdict:"failed",mutation:{requestObserved:true,originalPduRef:7,deliveredPduRef:8,originalBytes:38,deliveredBytes:38},
    unverifiedFreshValues:true,readRequests:1,correctReadbacks:1,proxyErrors:[],
    error:"cannot accept corrupted single READ_VAR reply"};
  assert.equal(verifyWrongPdu(legitimate).outcome,"KNOWN_UNSAFE");
  assert.throws(()=>verifyWrongPdu({...legitimate,mutation:{...legitimate.mutation,deliveredPduRef:7}}));
  assert.throws(()=>verifyWrongPdu({...legitimate,unverifiedFreshValues:false}));
  assert.throws(()=>verifyWrongPdu({...legitimate,mutation:null}));
  assert.throws(()=>verifyWrongPdu({...legitimate,readRequests:2}));
});
test("negative control: lost ACK is not a defect unless the first write was proven applied",()=>{
 const c={implementation:"node-red-contrib-s7-rust@1.4.0",nodeRed:"5.0.9",caseMode:"full",result:"failed",
  scenarios:{healthy_read:{result:"passed"},invalid_write:{result:"passed"},
    acknowledged_write:{result:"passed"},pending_read_on_unload:{result:"passed"},
    lost_write_ack:{result:"failed",fixtureApplied:true,ackDropsObserved:1,
      observedOutcome:"unexpected_success",totalWireWritesForAttempt:2,replayedWriteCount:1},
    blackhole_and_explicit_removal:{result:"failed",cotpObserved:true,reconnectAttemptsAfterRemoval:2,socketsAfterRemoval:0}}};
 assert.equal(verifyWriteAndLifecycle(c).outcome,"KNOWN_UNSAFE");
 assert.throws(()=>verifyWriteAndLifecycle({...c,scenarios:{...c.scenarios,lost_write_ack:{...c.scenarios.lost_write_ack,fixtureApplied:false}}}));
 assert.throws(()=>verifyWriteAndLifecycle({...c,scenarios:{...c.scenarios,blackhole_and_explicit_removal:{...c.scenarios.blackhole_and_explicit_removal,reconnectAttemptsAfterRemoval:0}}}));
 assert.throws(()=>verifyWriteAndLifecycle({...c,scenarios:{...c.scenarios,healthy_read:{result:"failed"}}}));
});
test("positive control: valid parser outcome must include rejection and later correct read",()=>{
 const good={engine:"rust",pkg:"1.4.0",nodeRed:"5.0.9",fault:"inconsistent_data_length",verdict:"passed",
   unverifiedFreshValues:false,mutation:{requestObserved:true,originalDataLength:17,deliveredDataLength:32767},
   readRequests:2,correctReadbacks:1,proxyErrors:[]};
 assert.equal(verifyGoodRead(good).outcome,"SAFE_ON_THIS_CASE");
 assert.throws(()=>verifyGoodRead({...good,readRequests:1}));
});
