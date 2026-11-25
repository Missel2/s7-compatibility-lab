// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Test only the real, independently installed Apache PLC4X Java driver.
// All network traffic goes through a disposable IPv4 loopback relay/fixture.
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawn,execFileSync}=require("node:child_process");
const {once}=require("node:events");
const readline=require("node:readline");
const {setTimeout:sleep}=require("node:timers/promises");
const {createWirePeer}=require("../lib/wire-peer.cjs");
const root=path.resolve(__dirname,".."),out=path.join(root,"test-reports");
const javaProject=path.join(root,"java/plc4x-readonly-client");
const originalPath=path.join(out,"plc4x-java-original.json");
const reportPath=path.join(out,"plc4x-java-assessment.json");
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const sha=/^[0-9a-f]{40}$/,digest=/^[0-9a-f]{64}$/;
const expected={temperature:12.5,counter:-123,writable:3.25};
const oracleId="healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1";
const driver="org.apache.plc4x:plc4j-driver-s7:1.0.0";
function verifyPlc4xEvidence(report,head,raw) {
 assert.match(head,sha);
 assert.ok(Buffer.isBuffer(raw)&&raw.length>50,"Original Java stdout required");
 assert.equal(report.sourceCommit,head);
 assert.equal(report.status,"NOT_QUALIFIED");
 assert.equal(report.candidateQualified,false);
 assert.equal(report.instrumentControlsValid,true);
 assert.equal(report.classification,"SCOPED_PASS");
 assert.equal(report.originalExit,0);
 assert.equal(report.originalSignal,null);
 assert.equal(report.originalReportSha256,sha256(raw));
 assert.equal(report.originalReport,"plc4x-java-original.json");
 assert.match(report.driverJarSha256,digest);
 assert.equal(report.driver,driver);
 assert.equal(report.javaMajor,21);
 assert.ok(Number.isInteger(report.readRequests)&&report.readRequests>=1);
 assert.equal(report.writeRequests,0,"Unauthorized Java write");
 assert.ok(report.cotpRequests>=1);
 assert.equal(report.activeSessions,0);
 assert.ok(report.closedSessions>=1);
 assert.equal(report.cleanClose,true);
 assert.deepEqual(report.relayErrors,[]);
 assert.deepEqual(report.invalidTpkt,[],"Strict healthy oracle forbids any non-TPKT payload");
 const wire=report.wireEvidence;
 assert.equal(wire.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(wire.evidenceType,"COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP");
 assert.ok(wire.eventCount>=4&&wire.eventCount===wire.events.length);
 assert.match(wire.chainSha256,digest);
 assert.ok(wire.events.some(x=>x.direction==="client_rx"&&digest.test(x.frameSha256)));
 assert.ok(wire.events.some(x=>x.direction==="fixture_rx"&&digest.test(x.frameSha256)));
 const original=JSON.parse(raw.toString("utf8"));
 assert.deepEqual(Object.keys(original).sort(),["schemaVersion","sourceCommit","candidate","version",
  "scope","protocol","oracleId","host","db","status","clientCloseInvoked","candidateQualified","observed"].sort());
 assert.equal(original.schemaVersion,1);
 assert.equal(original.sourceCommit,head);
 assert.equal(original.candidate,"apache-plc4x-java");
 assert.equal(original.version,"1.0.0");
 assert.equal(original.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(original.protocol,"S7COMM_CLASSIC");
 assert.equal(original.oracleId,oracleId);
 assert.equal(original.host,"127.0.0.1");
 assert.equal(original.db,1);
 assert.equal(original.status,"passed");
 assert.equal(original.candidateQualified,false);
 assert.equal(original.clientCloseInvoked,true);
 assert.deepEqual(original.observed,expected);
 return {candidate:"apache-plc4x-java",version:"1.0.0",outcome:"SCOPED_PASS",
   sourceCommit:head,originalSha256:sha256(raw),candidateQualified:false};
}
function timeout(p,ms,what){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error("TIMEOUT "+what)),ms))]).finally(()=>clearTimeout(timer));}
async function poll(fn,ms,what){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(50);}throw Error("TIMEOUT "+what);}
async function startFixture(){
 const child=spawn("python",["-u","fixtures/s7_server.py"],{cwd:root,
  env:{...process.env,S7_FIXTURE_PORT:"0",S7_FIXTURE_DB_BYTES:"2048",PYTHONUNBUFFERED:"1"},
  stdio:["ignore","pipe","pipe"]});
 const lines=readline.createInterface({input:child.stdout});
 let stderr="";
 child.stderr.on("data",b=>{stderr+=String(b).slice(-3000)});
 const closed=once(child,"close");
 try{
  const port=await timeout(new Promise((resolve,reject)=>{
   const onLine=line=>{const m=/^S7_WIRE_FIXTURE_READY (\d+) (3\.3\.1)$/.exec(line);if(m){cleanup();resolve(Number(m[1]));}else{cleanup();reject(Error("Invalid fixture banner "+line));}};
   const onClose=()=>{cleanup();reject(Error("Fixture crashed: "+stderr))};
   const cleanup=()=>{lines.off("line",onLine);child.off("close",onClose)};
   lines.on("line",onLine);child.once("close",onClose);
  }),14000,"fixture startup");
  assert.ok(port>=1024&&port<=65535);
  return {port,async stop(){lines.close();if(child.exitCode===null&&child.signalCode===null)child.kill("SIGTERM");await timeout(closed,6000,"fixture shutdown")}};
 }catch(e){child.kill("SIGKILL");lines.close();throw e}
}
function javaClasspath(){
 const cp=fs.readFileSync(path.join(javaProject,"target/classpath.txt"),"utf8").trim();
 const driverJar=path.join(os.homedir(),".m2/repository/org/apache/plc4x/plc4j-driver-s7/1.0.0/plc4j-driver-s7-1.0.0.jar");
 assert.ok(fs.existsSync(driverJar),"Published PLC4X 1.0.0 JAR not installed");
 assert.ok(fs.statSync(driverJar).size>20000,"Unexpected published PLC4X JAR size");
 assert.ok(cp.split(path.delimiter).includes(driverJar),"Runtime classpath does not contain exact published S7 driver");
 const classes=path.join(javaProject,"target/classes");
 assert.ok(fs.existsSync(path.join(classes,"org/rischlab/s7lab/Plc4xReadonlyS7Candidate.class")),"Java source not compiled");
 const observedJarSha256=sha256(fs.readFileSync(driverJar));
 const pinned=fs.readFileSync(path.join(javaProject,"plc4j-driver-s7-1.0.0.sha256"),"utf8").trim().split(/\s+/)[0];
 assert.match(pinned,digest,"Only an exact SHA256 pinned published Maven release may be assessed");
 assert.equal(observedJarSha256,pinned,"Upstream PLC4X Maven artifact does not match reviewed SHA256");
 return {cp:classes+path.delimiter+cp,driverJarSha256:observedJarSha256};
}
async function runJava(cp,port,head,entrypoint="org.rischlab.s7lab.Plc4xReadonlyS7Candidate"){
 const child=spawn("java",["-Xms32m","-Xmx256m","-cp",cp,
  entrypoint,"--port",String(port)],{
  cwd:root,env:{...process.env,S7_LAB_SOURCE_SHA:head},stdio:["ignore","pipe","pipe"]});
 let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),truncated=false;
 const append=(b,x)=>{if(b.length+x.length>65536)truncated=true;return Buffer.concat([b,x.subarray(0,Math.max(0,65536-b.length))]);};
 child.stdout.on("data",b=>stdout=append(stdout,b));child.stderr.on("data",b=>stderr=append(stderr,b));
 const closed=once(child,"close");let code=null,signal=null,timedOut=false;
 try{try{[code,signal]=await timeout(closed,25000,"Java client")}catch(e){if(!String(e.message).startsWith("TIMEOUT Java client"))throw e;timedOut=true;child.kill("SIGKILL");[code,signal]=await timeout(closed,5000,"killed Java client");}}
 finally{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");}
 return {code,signal,timedOut,truncated,stdout,stderr};
}
async function main(){
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 assert.match(head,sha);if(process.env.GITHUB_SHA)assert.equal(head,process.env.GITHUB_SHA);
 assert.equal(process.platform,"linux");assert.equal(process.arch,"x64");
 const javacVersion=execFileSync("javac",["-version"],{encoding:"utf8"}).trim();
 const major=Number(/^javac (\d+)/.exec(javacVersion)?.[1]);
 assert.equal(major,21,"This evidence is only qualified for an actual Java 21 runtime");
 const c=javaClasspath();
 fs.mkdirSync(out,{recursive:true});fs.rmSync(originalPath,{force:true});
 const report={schemaVersion:1,sourceCommit:head,driver,driverJarSha256:c.driverJarSha256,
  javaMajor:major,scope:"SOFTWARE_LOOPBACK_ONLY",status:"NOT_QUALIFIED",
  classification:"UNASSESSED",candidateQualified:false,instrumentControlsValid:false,
  originalReport:path.basename(originalPath)};
 let fixture,peer;
 try{
  fixture=await startFixture();peer=await createWirePeer(fixture.port);
  const result=await runJava(c.cp,peer.port,head);
  fs.writeFileSync(originalPath,result.stdout);
  Object.assign(report,{originalExit:result.code,originalSignal:result.signal,
   originalTimedOut:result.timedOut,originalTruncated:result.truncated,
   originalReportSha256:sha256(result.stdout),originalStderrSha256:sha256(result.stderr),
   originalStderrTail:result.stderr.toString("utf8").slice(-4000),
   readRequests:peer.reads.length,writeRequests:peer.writes.length,
   cotpRequests:peer.cotpRequests,closedSessions:peer.closed.length,
   activeSessions:peer.active.size,relayErrors:peer.errors.slice(),
   invalidTpkt:peer.invalidTpkt.slice(),cotpDisconnectRequests:peer.cotpDisconnectRequests,
   wireEvidence:peer.getWireEvidence()});
  if(result.code!==0||result.signal||result.timedOut||result.truncated){
   report.classification="CANDIDATE_FAILURE_OR_FIXTURE_INCOMPATIBLE";
   report.errorOrigin="REAL_PLC4X_JAVA_PROCESS";
   throw Error("Original published Java candidate exited="+result.code+" signal="+result.signal+
      " timedOut="+result.timedOut+"; "+report.originalStderrTail);
  }
  await poll(()=>peer.active.size===0&&peer.closed.length>=1,4000,"Java TCP close");
  report.closedSessions=peer.closed.length;report.activeSessions=peer.active.size;
  report.cleanClose=peer.errors.length===0&&peer.invalidTpkt.length===0;
  report.instrumentControlsValid=true;report.classification="SCOPED_PASS";
  verifyPlc4xEvidence(report,head,result.stdout);
  console.log("PLC4X_JAVA_REAL_CANDIDATE="+JSON.stringify({head,candidate:driver,
    oracle:oracleId,readRequests:report.readRequests,writeRequests:report.writeRequests,
    frames:report.wireEvidence.eventCount,driverJarSha256:c.driverJarSha256,
    candidateQualified:false,status:report.classification}));
 }catch(e){
  if(report.invalidTpkt?.length&&report.originalExit===0&&report.readRequests>=1&&report.writeRequests===0){
   report.classification="CANDIDATE_POST_DISCONNECT_NON_TPKT_UNQUALIFIED";
   report.errorOrigin="REAL_PLC4X_CLIENT_WIRE";
   report.cleanClose=false;
  }else if(report.classification==="SCOPED_PASS"||report.classification==="UNASSESSED"){
   report.classification="HARNESS_OR_ASSESSOR_FAILURE";
   report.instrumentControlsValid=false;
  }
  report.strictAssessorExit=1;
  report.error=String(e?.stack||e).slice(0,6000);process.exitCode=1;
  console.error("PLC4X_JAVA_REAL_CANDIDATE_RED "+report.error);
 }finally{
  if(peer)try{await timeout(peer.close(),6000,"relay teardown")}catch(e){report.peerCleanupError=String(e);process.exitCode=1}
  if(fixture)try{await fixture.stop()}catch(e){report.fixtureCleanupError=String(e);process.exitCode=1}
  if(report.peerCleanupError||report.fixtureCleanupError){report.classification="HARNESS_TEARDOWN_FAILURE";report.instrumentControlsValid=false;}
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
 }
}
if(require.main===module)main().catch(e=>{console.error("PLC4X_HARNESS_RED "+String(e?.stack||e));process.exitCode=1;});
module.exports={verifyPlc4xEvidence,javaClasspath,runJava};
