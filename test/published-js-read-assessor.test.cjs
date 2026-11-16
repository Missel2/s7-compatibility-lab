// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyFault,verifyPositive}=require('../scripts/assess-published-js-read.cjs');
const commit='a'.repeat(40);
function safe(fault='inconsistent_data_length'){
 return {schemaVersion:1,engine:'js',pkg:'4.4.1',nodeRed:'5.0.9',sourceCommit:commit,
 fault,server:'python-snap7==3.3.1, 2KiB disposable DB1',hardware:'PENDING_HARDWARE',
 candidatePass:false,classification:'UNASSESSED_NOT_QUALIFIED',verdict:'passed',unverifiedFreshValues:false,
 readFaultClassification:'NO_INVALID_FRESH_OBSERVED',readRequests:2,correctReadbacks:1,proxyErrors:[],
 injectedCount:1,mutation:{requestObserved:true,mutation:fault,originalBytes:44,deliveredBytes:44,
 originalDataLength:20,deliveredDataLength:32767,originalPduRef:3,deliveredPduRef:4},
 proxyDiagnostics:{errors:[],mutationStillArmed:null}};
}
test('strict safe case does not grant candidate qualification',()=>{
 assert.deepEqual(verifyFault(safe(),'inconsistent_data_length',commit),
 {classification:'NO_INVALID_FRESH_OBSERVED',candidateExit:0});
});
test('wrong PDU reference with unsafe value requires exact strict candidate failure',()=>{
 const d=safe('wrong_pdu_reference');Object.assign(d,{verdict:'failed',readRequests:1,
 unverifiedFreshValues:true,readFaultClassification:'KNOWN_UNSAFE',
 error:'AssertionError: cannot accept corrupted single READ_VAR reply as valid fresh data'});
 assert.deepEqual(verifyFault(d,'wrong_pdu_reference',commit),{classification:'KNOWN_UNSAFE',candidateExit:1});
 assert.throws(()=>verifyFault({...d,readRequests:2},'wrong_pdu_reference',commit));
 assert.throws(()=>verifyFault({...d,error:'HARNESS_TIMEOUT'},'wrong_pdu_reference',commit));
 assert.throws(()=>verifyFault({...d,unverifiedFreshValues:false},'wrong_pdu_reference',commit));
});
test('rejects omitted injection, stale source, cleanup failure and fabricated results',()=>{
 const d=safe();
 const variants=[
 {...d,sourceCommit:'b'.repeat(40)},
 {...d,injectCount:1,injectedCount:0},
 {...d,proxyErrors:['ECONNRESET']},
 {...d,fixtureStopError:'fixture died'},
 {...d,candidatePass:true},
 {...d,mutation:{...d.mutation,requestObserved:false}},
 {...d,mutation:{...d.mutation,deliveredDataLength:20}},
 {...d,verdict:'failed',error:'arbitrary crash'},
 ];
 for(const v of variants)assert.throws(()=>verifyFault(v,'inconsistent_data_length',commit));
});
test('short response needs exactly twelve delivered bytes',()=>{
 const d=safe('short_s7_reply');d.mutation.deliveredBytes=12;
 assert.equal(verifyFault(d,'short_s7_reply',commit).classification,'NO_INVALID_FRESH_OBSERVED');
 assert.throws(()=>verifyFault({...d,mutation:{...d.mutation,deliveredBytes:44}},'short_s7_reply',commit));
});
test('healthy comparator is required and pinned',()=>{
 const p={schemaVersion:1,status:'passed',sourceCommit:commit,
 packageIds:{js:'4.4.1',rust:'1.4.0'},
 candidates:{js:{status:'passed',readVerified:true,closeVerified:true}}};
 assert.doesNotThrow(()=>verifyPositive(p,commit));
 assert.throws(()=>verifyPositive({...p,status:'failed'},commit));
 assert.throws(()=>verifyPositive({...p,candidates:{js:{...p.candidates.js,closeVerified:false}}},commit));
});
