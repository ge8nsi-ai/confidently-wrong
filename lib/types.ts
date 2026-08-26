export type Conf = 1 | 2 | 3;
export type Phase = "pick" | "probe" | "reveal" | "repair" | "recheck" | "done";
export type Quadrant = "SURE_RIGHT" | "SURE_WRONG" | "UNSURE_RIGHT" | "UNSURE_WRONG";

export interface Option {
  id: string;
  text: string;
  correct: boolean;
  misconception?: string;
}

export interface Refutation {
  believe: string;
  wrong: string;
  actual: string;
}

export interface Item {
  id: string;
  conceptId: string;
  /** Human-readable topic label. Derived from conceptId when absent. */
  topic?: string;
  stem: string;
  options: Option[];
  sourceNote?: string;
  variantOf?: string;
  fallbackRefutation: Refutation;
}

export interface Response {
  itemId: string;
  chosenOptionId: string;
  conf: Conf;
  correct: boolean;
  round: "probe" | "recheck";
}

export interface Pack {
  id: string;
  title: string;
  blurb: string;
  items: Item[];
  /** Custom packs are generated from the learner's own material. */
  origin?: "builtin" | "custom";
  createdAt?: number;
  sourceName?: string;
}

/** What a response was about, kept alongside history so topics survive. */
export interface ItemMeta {
  conceptId: string;
  topic: string;
  stem: string;
}

/** One completed pass through a pack, stored for the dashboard. */
export interface SessionRecord {
  id: string;
  packId: string;
  packTitle: string;
  origin: "builtin" | "custom";
  startedAt: number;
  updatedAt: number;
  finished: boolean;
  probe: Response[];
  recheck: Response[];
  itemMeta: Record<string, ItemMeta>;
}
