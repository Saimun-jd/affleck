import type { LearningGroup } from "../types";

export interface GroupTarget {
  kind: "resource" | "playlist";
  id: string;
  title: string;
  groupId?: string | null;
}

export function normalizeGroupName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchingGroups(groups: LearningGroup[], query: string): LearningGroup[] {
  const key = normalizeGroupName(query);
  return groups.filter((group) => normalizeGroupName(group.name).includes(key))
    .sort((a, b) => Number(normalizeGroupName(b.name) === key) - Number(normalizeGroupName(a.name) === key) || a.name.localeCompare(b.name));
}
