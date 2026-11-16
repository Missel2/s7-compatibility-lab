# Exact-byte TPKT transcript v1

The observer now hashes each **complete** loopback TPKT frame at the TCP relay boundary. Evidence includes a direction, local session number, byte length, SHA-256 of the exact frame bytes, and a chained SHA-256 over ordered events. This is NOT a signed attestation, a raw packet capture, or Siemens CPU/firmware proof.

Directions are `client_rx` (from candidate/probe), `fixture_tx` (forwarded to software server), `fixture_rx` (observed from server), `client_tx` (delivered to candidate/probe), `fixture_ack_dropped` (real server ACK intentionally suppressed), and `fixture_read_withheld` (server READ ACK intentionally withheld). These explicitly separate a genuine server ACK from an injected response or a suppressed ACK.

The stream has a **hard limit of 4096 events** per relay. Exceeding the limit produces a parser/observer failure; it never quietly creates a truncated proof. TPKT frame length/version/reserved bytes are checked before hashing. Snapshots are copies and never retain raw payload bytes. Only the existing loopback fixture may feed the relay in CI.

The real positive fixture proof stores this event chain within `test-reports/harness-wire-baseline.json`. Independent socket selftests compare the original upstream response SHA with the mutated delivered response SHA and prove that an intentionally dropped WRITE_VAR ACK was received from the fixture but **not** delivered.

**Boundaries:** The hashes attest to bytes observed by this software relay in its process. They do not authenticate a remote peer, prove that a candidate consumed a delivered response, or substitute for an external packet capture. The candidate safety gate still requires direct execution-linked source integrity and semantic assertions. Historical Rust results do not retroactively contain this transcript: rerun on a matching revision to produce new evidence.
