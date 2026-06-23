import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { closeHttpServer } from "../src/shutdown.js";

test("closeHttpServer force-closes lingering connections after the grace period", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("open");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}`);
  assert.equal(response.status, 200);

  await assert.doesNotReject(closeHttpServer(server, 10));
});
