// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab S7 Compatibility Lab. Disposable DB1 over IPv4 loopback.
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.apache.plc4x.java.api.PlcDriverManager;
import org.apache.plc4x.java.api.types.PlcResponseCode;

class Plc4xHistoricalRead {
    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].equals("--port")) {
            throw new IllegalArgumentException("Expected the local fixture port");
        }
        int port = Integer.parseInt(args[1]);
        if (port < 1024 || port > 65535) {
            throw new IllegalArgumentException("Expected an unprivileged local port");
        }
        String head = System.getenv("S7_LAB_SOURCE_SHA");
        if (head == null || !head.matches("[0-9a-f]{40}")) {
            throw new IllegalStateException("Missing test source SHA");
        }
        String url = "s7://127.0.0.1:" + port
            + "?controller-type=S7_1200&remote-rack=0&remote-slot=1&read-timeout-ms=5000";
        float real0;
        int int4;
        float real8;
        try (var connection = PlcDriverManager.getDefault().getConnectionManager().getConnection(url)) {
            var response = connection.readRequestBuilder()
                .addTagAddress("real0", "%DB1.DBD0:REAL")
                .addTagAddress("int4", "%DB1.DBW4:INT")
                .addTagAddress("real8", "%DB1.DBD8:REAL")
                .build().execute().get(6500, TimeUnit.MILLISECONDS);
            for (String field : new String[] {"real0", "int4", "real8"}) {
                if (response.getResponseCode(field) != PlcResponseCode.OK) {
                    throw new IllegalStateException("DB1 read failed for " + field);
                }
            }
            real0 = response.getFloat("real0");
            int4 = response.getInteger("int4");
            real8 = response.getFloat("real8");
            if (real0 != 12.5f || int4 != -123 || real8 != 3.25f) {
                throw new AssertionError("Unexpected synthetic DB1 values");
            }
        }
        System.out.printf(Locale.ROOT,
            "{\"version\":\"0.13.1\",\"sourceCommit\":\"%s\",\"observed\":{\"real0\":%.2f,\"int4\":%d,\"real8\":%.2f}}%n",
            head, real0, int4, real8);
    }
}
