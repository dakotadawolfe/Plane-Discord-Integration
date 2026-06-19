import type { Response } from "express";

export type ProjectDeskEvent =
  | { type: "work_items_changed"; at: string }
  | { type: "work_item_changed"; workItemId: string; at: string }
  | { type: "notifications_changed"; at: string };

type ProjectDeskEventInput =
  | { type: "work_items_changed" }
  | { type: "work_item_changed"; workItemId: string }
  | { type: "notifications_changed" };

const clients = new Set<Response>();

export function addEventClient(res: Response): () => void {
  clients.add(res);

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  return () => {
    clients.delete(res);
  };
}

export function emitProjectDeskEvent(event: ProjectDeskEventInput): void {
  const payload: ProjectDeskEvent = {
    ...event,
    at: new Date().toISOString()
  } as ProjectDeskEvent;
  const message = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of [...clients]) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function heartbeatEventClients(): void {
  for (const client of [...clients]) {
    try {
      client.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}
