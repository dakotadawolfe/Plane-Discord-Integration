import type { Server } from "node:http";

export function closeHttpServer(server: Server, forceCloseAfterMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
    }, forceCloseAfterMs);

    server.close((error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(forceClose);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
