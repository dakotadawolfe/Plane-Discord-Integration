import { archiveInactiveWorkItems } from "./db.js";
import { emitProjectDeskEvent } from "./events.js";

const inactiveArchiveDays = 30;

export function runInactiveArchiveSweep(): number {
  const archivedItems = archiveInactiveWorkItems(inactiveArchiveDays);

  if (archivedItems.length === 0) {
    return 0;
  }

  emitProjectDeskEvent({ type: "work_items_changed" });

  for (const item of archivedItems) {
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: item.id });
  }

  return archivedItems.length;
}
