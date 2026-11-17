// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A strict candidate probe, NOT a green release qualification.
// The S7 fixture must apply the write and return its positive ACK to the relay;
// ONLY the relay suppresses ACK delivery to the JS client.
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {performance}=require('node:perf_hooks');
const {setTimeout:delay}=require('node:timers/promises');
const {createWirePeer}=require('../../lib/wire-peer.cjs');

const root=path.resolve(__dirname,'../..');
const userDir=path.resolve(process.argv[2]||'/dev/null');
const consumer=createRequire(path.join(userDir,'package.json'));
const helper=consumer('node-red-node-test-helper');
const output=path.join(root,'test-reports/published-js-lost-write-ack.json');
const report={
 schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 candidate:'@oriolrius/node-red-contrib-s7@4.4.1',
 transport:'@oriolrius/nodes7@1.1.5',
 nodeRed:consumer('node-red/package.json').version,
 packageVersion:consumer('@oriolrius/node-red-contrib-s7/package.json').version,
 fixture:'python-snap7@3.3.1 DB1 64 synthetic bytes',
 hardware:'PENDING_HARDWARE',candidatePass:false,
 fullCandidateQualification:false,
 status:'failed',classification:'HARNESS_UNASSESSED',scenarios:{}
};
function bound(p,ms,name){
 let timer;
 return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('HARNESS_TIMEOUT '+name)),ms)})])
  .finally(()=>clearTimeout(timer));
}
async function until(fn,ms,name){
 const end=performance.now()+ms;
 while(performance.now()<end){if(fn())return;await delay(35)}
 throw Error('HARNESS_TIMEOUT '+name);
}
async function startFixture(){
 const child=spawn(process.env.S7_FIXTURE_PYTHON||'python',['-u','fixtures/s7_server.py'],{
  cwd:root,env:{...process.env,S7_FIXTURE_PORT:'0',S7_FIXTURE_DB_BYTES:'64'},stdio:['ignore','pipe','pipe']
 });
 const lines=readline.createInterface({input:child.stdout});
 const closed=once(child,'close');
 try{
  const port=await bound(Promise.race([
   once(lines,'line').then(([line])=>{
    const m=/^S7_WIRE_FIXTURE_READY (\d+) (3\.3\.1)$/.exec(line);
    assert.ok(m,'Exact python-snap7 3.3.1 fixture readiness');
    return Number(m[1]);
   }),
   closed.then(()=>{throw Error('Fixture quit before ready')})
  ]),12000,'fixture startup');
  assert.ok(port>=1024&&port<=65535);
  return {port,async stop(){
   lines.close();
   if(child.exitCode===null&&child.signalCode===null)child.kill();
   await bound(closed,8000,'fixture shutdown');
  }};
 }catch(e){child.kill('SIGKILL');throw e}
}
function setupFlow(port){
 return [
  {id:'ep',type:'s7 endpoint',transport:'iso-on-tcp',connmode:'rack-slot',
   address:'127.0.0.1',port,rack:0,slot:1,timeout:2000,cycletime:0,
   vartable:[{name:'target',addr:'DB1,REAL8'},{name:'sentinel',addr:'DB1,REAL0'}]},
  {id:'reader',type:'s7 in',endpoint:'ep',mode:'all',diff:false,wires:[['read-sink']]},
  {id:'control',type:'s7 control',endpoint:'ep',function:'',wires:[[]]},
  {id:'writer',type:'s7 out',endpoint:'ep',variable:'',wires:[]},
  {id:'read-sink',type:'helper'}
 ];
}
async function readThroughCandidate(){
 const sink=helper.getNode('read-sink');
 const received=once(sink,'input');
 helper.getNode('control').receive({function:'trigger',payload:'read'});
 const [msg]=await bound(received,10000,'positive JS read');
 assert.ok(msg.payload&&typeof msg.payload==='object');
 return msg.payload;
}
function witness(port,value){
 const bytes=execFileSync(process.env.S7_FIXTURE_PYTHON||'python',[
  'scripts/s7_readonly_real8_witness.py','--port',String(port),'--expected-real',String(value)
 ],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:128*1024});
 return JSON.parse(bytes);
}
async function main(){
 let fixture,peer,loaded=false,started=false;
 try{
  assert.equal(process.platform,'linux');
  assert.equal(process.arch,'x64');
  assert.equal(report.nodeRed,'5.0.9');
  assert.equal(report.packageVersion,'4.4.1');
  assert.equal(consumer('@oriolrius/nodes7/package.json').version,'1.1.5');
  assert.equal(process.env.S7RS_NAPI,undefined);
  fixture=await startFixture();
  peer=await createWirePeer(fixture.port);
  helper.init(consumer.resolve('node-red'));
  await bound(helper.startServer(),15000,'Node-RED start');
  started=true;
  await bound(helper.load([consumer('@oriolrius/node-red-contrib-s7/red/s7.js')],setupFlow(peer.port)),14000,'JS flow load');
  loaded=true;
  const ep=helper.getNode('ep');
  await until(()=>ep.getStatus?.()==='online',14000,'published JS connected');
  const writer=helper.getNode('writer');
  const callbackErrors=[];
  writer.on('call:error',(...args)=>{
   if(callbackErrors.length<12)callbackErrors.push(args.map(x=>typeof x==='string'?x:String(x?.message||x)).join(' ').slice(0,800));
  });
  const initial=await readThroughCandidate();
  assert.equal(initial.target,3.25);
  assert.equal(initial.sentinel,12.5);
  const writesBefore=peer.writes.length;
  writer.receive({variable:'target',payload:19.75});
  await until(()=>peer.writes.length===writesBefore+1,4000,'positive wire WRITE_VAR');
  let positiveVerified=false;
  const positiveDeadline=performance.now()+6500;
  while(performance.now()<positiveDeadline){
   const values=await readThroughCandidate();
   if(values.target===19.75&&values.sentinel===12.5){positiveVerified=true;break}
   await delay(75);
  }
  assert.equal(positiveVerified,true,'Real applied + ACKed write positive control');
  assert.equal(peer.writes.length-writesBefore,1,'Positive input must produce exactly one WRITE_VAR');
  report.scenarios.acknowledged_write={status:'passed',positiveReal8:19.75,
   wireWrites:1,readback:19.75};

  const preLoss=peer.writes.length;
  peer.dropWriteAck=true;
  const start=performance.now();
  writer.receive({variable:'target',payload:-8.5});
  await until(()=>peer.droppedWrites.length===1,7500,'fixture ACK withheld after applied WRITE_VAR');
  assert.equal(peer.droppedWrites[0].fixtureAcknowledged,true,'ACK must prove upstream fixture accepted write');
  assert.equal(peer.dropWriteAck,false,'Fault injection must happen exactly once');
  // Observe retries even after the driver detects timeout/reconnect.
  await delay(11000);
  const total=peer.writes.length-preLoss;
  const tcpEvidence=peer.getWireEvidence();
  report.scenarios.lost_write_ack={
   status:total===1?'passed':'failed',
   expectedValue:-8.5,
   observedWireWrites:total,
   duplicateWireWrites:Math.max(0,total-1),
   fixtureApplied:true,
   droppedAckCount:peer.droppedWrites.length,
   peerDroppedAckProof:peer.droppedWrites[0],
   callbackErrors:callbackErrors.slice(),
   observationMs:Math.round(performance.now()-start),
   wireEvidence:tcpEvidence
  };
  await bound(helper.unload(),9500,'JS unload after ACK loss');
  loaded=false;
  await until(()=>peer.active.size===0,5500,'relay client teardown');
  report.scenarios.lost_write_ack.externalReadback=witness(fixture.port,-8.5);
  report.scenarios.lost_write_ack.externalVerified=true;
  report.classification=total>1?'DUPLICATE_WRITE_KNOWN_UNSAFE':'NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED';
  // A no-replay result is *only* a narrow observed property, never proof that
  // an API reported an uncertain outcome correctly.
  report.status=total===1?'passed':'failed';
  assert.equal(total,1,'strict original safety assertion: duplicate WRITE_VAR after applied and lost ACK');
 }catch(e){
  if(report.classification==='HARNESS_UNASSESSED')
   report.fatal=String(e?.stack||e).slice(0,3500);
  else report.strictError=String(e?.stack||e).slice(0,3500);
  report.status='failed';
 }finally{
  if(loaded){
   try{await bound(helper.unload(),9000,'cleanup unload')}catch(e){report.cleanupError=String(e);report.status='failed'}
  }
  if(started){
   try{await bound(helper.stopServer(),12000,'Node-RED stop')}catch(e){report.stopError=String(e);report.status='failed'}
  }
  if(peer){
   report.relayErrors=peer.errors.slice();
   try{await bound(peer.close(),9000,'relay close')}catch(e){report.proxyError=String(e);report.status='failed'}
  }
  if(fixture){
   try{await fixture.stop()}catch(e){report.fixtureError=String(e);report.status='failed'}
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log('PUBLISHED_JS_ACK_LOSS_CANDIDATE='+JSON.stringify({
   status:report.status,classification:report.classification,
   writes:report.scenarios.lost_write_ack?.observedWireWrites,
   errors:report.scenarios.lost_write_ack?.callbackErrors?.length??null
  }));
  if(report.fatal)console.error(report.fatal);
  if(report.status!=='passed')process.exitCode=1;
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
