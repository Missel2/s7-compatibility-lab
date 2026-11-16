"""Read and write ONLY synthetic DB1 on ephemeral IPv4 loopback server."""
import argparse
import json
import struct

from snap7.client import Client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Only unprivileged local ports are allowed")

    client = Client()
    try:
        # No host parameter is accepted: the probe cannot target a real PLC.
        client.connect("127.0.0.1", 0, 1, args.port)
        original = client.db_read(1, 0, 12)
        first_real = struct.unpack_from(">f", original, 0)[0]
        counter = struct.unpack_from(">h", original, 4)[0]
        before = struct.unpack_from(">f", original, 8)[0]
        if (first_real, counter, before) != (12.5, -123, 3.25):
            raise AssertionError("Synthetic fixture did not contain exact expected bytes")

        # Disposable fixture DB1 only. No real addresses or arbitrary writes.
        client.db_write(1, 8, bytearray(struct.pack(">f", 19.75)))
        updated = client.db_read(1, 0, 12)
        after = struct.unpack_from(">f", updated, 8)[0]
        if struct.unpack_from(">f", updated, 0)[0] != first_real:
            raise AssertionError("Unrelated REAL changed")
        if struct.unpack_from(">h", updated, 4)[0] != counter:
            raise AssertionError("Unrelated INT changed")
        if after != 19.75:
            raise AssertionError("WRITE_VAR readback did not match the exact new REAL")
        print(json.dumps({"status": "passed", "fixture": "python-snap7 3.3.1",
                          "firstReal": first_real, "counter": counter,
                          "before": before, "after": after,
                          "bytesRead": len(original) + len(updated),
                          "bytesWritten": 4}, sort_keys=True))
    finally:
        client.disconnect()


if __name__ == "__main__":
    main()
