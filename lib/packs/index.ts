import { chance } from "./chance";
import { seasons } from "./seasons";
import { selection } from "./selection";
import type { Pack } from "../types";

export const PACKS: Pack[] = [seasons, selection, chance];

export function getPack(packId: string): Pack | undefined {
  return PACKS.find((p) => p.id === packId);
}

export { chance, seasons, selection };
