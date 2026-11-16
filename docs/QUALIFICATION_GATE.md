# Strict candidate contract gate (schema guard; not hardware qualification)

Run only after an independent S7Comm loopback test process has produced real candidate observations:

```sh
node lib/qualification-gate.cjs ./candidate-results.json S7-ERR-003,S7-ERR-004
```

Exit code **1** indicates any missing, failed, skipped, unknown, duplicate, pending or structurally unverified contract. A successful run returns `SCOPED_CONTRACTS_PASS` and `full_candidate_qualification:false` for the exact requested contract IDs; **it does not certify any candidate or prove correctness of user-supplied JSON**.

Required input schema (example shape only; synthetic placeholders are not qualification evidence):

```json
{
  "schema_version": 1,
  "scope": "SOFTWARE_LOOPBACK_ONLY",
  "candidate": {
    "package": "exact-package-name",
    "version": "exact-version",
    "artifact_sha256": "64-lowercase-hex-characters"
  },
  "fixture": {
    "loopback": true,
    "revision": "exact-fixture-revision",
    "observer_sha256": "64-lowercase-hex-characters"
  },
  "contracts": [
    {
      "id": "S7-ERR-003",
      "outcome": "PASS",
      "evidence": {
        "capture_sha256": "64-lowercase-hex-characters",
        "observed_requests": 2,
        "assertions": 1,
        "independent_observer": true
      }
    }
  ]
}
```

The sample above is intentionally **not** a runnable proof: the hashes are placeholders. Never invent these fields to satisfy the gate. Real test adapters must populate them from independent captured bytes, original response and mutation observations, candidate package integrity, and exact fixture source. The schema guard verifies presence and structure, **not** authenticity of the claims. The end-to-end CI gate must execute the candidate tests and generate the evidence within the same trusted workflow before it invokes this verifier.

This gate deliberately prohibits broad candidate qualification and rejects registry entries with `PENDING_IMPLEMENTATION`. The still-open PR #3 characterization reports known unsafe Rust 1.4.0 results separately and cannot be converted into release success by this gate. Software-only success is not Siemens CPU/firmware HIL proof.
