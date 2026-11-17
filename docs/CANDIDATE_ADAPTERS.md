# Versioned real S7Comm client onboarding contract

This lab measures behavior; a green test is **not** a universal safety or PLC-firmware qualification.

## 1. Declare before scoring

Each released client must declare the exact package, version, transport and source hash/SRI, runtime, platform, protocol capabilities and a testable adapter process. The executable `comparisons/candidate-capabilities.v1.json` names **every** defined scenario for each candidate. States are exclusively `OBSERVED_SCOPED`, `NOT_TESTED` and `PENDING_HARDWARE`. `scripts/validate-candidate-capabilities.cjs` rejects unobserved PASS, unsupported protocol claims, fabricated source, duplicate candidates, missing scenarios and unpinned Python dependencies. The authoritative result remains the original exact-head CI run, not this declarative manifest.

## 2. Real client admission

1. Install unmodified, pinned released code in a **separate actual client process** with a verified dependency digest. Preserve upstream license/source attribution, never vendor driver code without permission.
2. Accept no arbitrary network host or real credentials. Only ephemeral 127.0.0.1 and disposable DB1 are allowed in public GitHub-hosted CI.
3. Run the same exact oracle with the same expected bytes and fault mutation. Different API semantics can be adapted, but three sequential writes are **not** a single user-level multi-item WRITE_VAR.
4. Require actual COTP and READ_VAR/WRITE_VAR through the independent TCP observer. Keep complete TPKT SHA256 hashes and a clean connection teardown.
5. Capture the **original strict process exit and JSON bytes**; bind their SHA256 to the exact checked-out test SHA, fixture and package. Failed safety assertions remain red for each candidate even when a separate historical characterization workflow is green.
6. Only then admit an observation to `comparisons/catalog.v1.json` with the actual CI run/commit and limitations; all other cells remain NOT_TESTED. HIL and S7CommPlus stay separate.

## 3. First cross-ecosystem example: Python

The first external adapter `scripts/candidates/python-snap7-read.py` runs the real `python-snap7==3.3.1` client in CPython 3.12, not in Node-RED. It can accept **only an ephemeral port**, never an address; its one READ_VAR reads `DB1[0:12]` with exact bytes `41480000ff85060740500000`, corresponding to REAL0=12.5, INT4=-123, REAL8=3.25. The Node observer requires one or more READ_VAR, **zero WRITE_VAR**, actual COTP, a closed socket, complete frame hashes and SHA256 of original client JSON. See [first real CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44037883892) and [same-head JS/Rust/Python CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44038695742).

The fixture server and Python client **share python-snap7 3.3.1**, but execute in different processes. Thus it validates an actual client from a new runtime/ecosystem, not an independent server implementation. Python multi-item write and all untested error cases stay NOT_TESTED; do not infer hardware compatibility.

## 4. Next independent language

Onboard **Apache PLC4X Java** with its own verified release, JDK and license, real Java S7Comm process, the *same* pinned DB1 READ_VAR oracle and observer, and separate source-bound CI evidence. Then consider native Snap7, S7.NetPlus and Go. Avoid invented scores, global speed rankings and S7CommPlus claims without a protocol-appropriate fixture.

## 5. Actual Apache PLC4X Java candidate with known-unsafe teardown

A released **PLC4X Java 1.0.0** S7Comm driver has actually executed against the same synthetic DB1, with Java21, source-pinned published driver JAR SHA256, original process output, true COTP and one READ_VAR, no writes. DB1 reads and Java exit are correct. However the original strict read-and-clean-close contract **fails** due to actual 21 non-TPKT zero bytes after a valid COTP disconnect; the separate exact-fingerprint characterization is the only permitted green discovery job. In `comparisons/catalog.v1.json` the observed `READ_HEALTHY_DB1` cell is therefore **`KNOWN_UNSAFE`** (not `SCOPED_PASS`), and every other Java scenario is NOT_TESTED/PENDING_HARDWARE. See [negative evidence](PLC4X_JAVA_DISCONNECT.md) and [PR #21](https://github.com/Missel2/s7-compatibility-lab/pull/21). Do not convert an unsafe cleanup into a successful result because three read values happened to be correct.
