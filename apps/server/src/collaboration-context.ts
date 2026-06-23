function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectReferencedItemIds(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const ids: string[] = [];

  if (typeof value.sourceItemId === "string") {
    ids.push(value.sourceItemId);
  }

  if (Array.isArray(value.itemReferences)) {
    for (const reference of value.itemReferences) {
      if (isRecord(reference) && typeof reference.id === "string") {
        ids.push(reference.id);
      }
    }
  }

  return ids;
}

export function collectReferencedItemIdsFromContextJsons(
  contextJsons: Array<string | null | undefined>,
  excludedIds: Array<string | null | undefined> = []
): string[] {
  const excluded = new Set(excludedIds.filter((id): id is string => Boolean(id)));
  const ids: string[] = [];
  const seen = new Set<string>(excluded);

  for (const contextJson of contextJsons) {
    if (!contextJson) {
      continue;
    }

    try {
      for (const id of collectReferencedItemIds(JSON.parse(contextJson))) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    } catch {
      continue;
    }
  }

  return ids;
}
