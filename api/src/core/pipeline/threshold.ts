import type { Relationship } from "../types.js";

export const DEFAULT_FLOOR = 3;

export interface Giver {
  giverId: string;
  relationship: Relationship;
}

export type ReleaseDecision =
  | { release: false; reason: string; totalGivers: number }
  | { release: true; splitByRelationship: boolean; totalGivers: number };

// Whether a receiver's report can be released, and whether it may show the
// direct-report / non-direct split. Only givers who contributed at least one
// approved item count.
export function releaseDecision(givers: Giver[], floor = DEFAULT_FLOOR): ReleaseDecision {
  const unique = new Map(givers.map((g) => [g.giverId, g.relationship]));
  const total = unique.size;
  if (total < floor) {
    return { release: false, reason: `Only ${total} giver(s); at least ${floor} are needed.`, totalGivers: total };
  }
  const direct = [...unique.values()].filter((r) => r === "direct_report").length;
  const nonDirect = total - direct;
  // Show the split only if both groups clear the floor. Otherwise a small group
  // (e.g. 1 non-direct) would be identifiable from the split alone.
  return { release: true, splitByRelationship: direct >= floor && nonDirect >= floor, totalGivers: total };
}

// Paraphrased examples are shown only for themes raised by at least this many givers.
export const MIN_GIVERS_FOR_EXAMPLES = 2;
