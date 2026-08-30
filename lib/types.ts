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
  /**
   * Endless packs grow while they are played: `items` is only what has arrived so
   * far, and the probe round ends when the learner says so or the target is met
   * rather than when the list runs out.
   */
  endless?: boolean;
  /** How many questions to ask before the reveal. Raisable mid-round. */
  target?: number;
  /**
   * The material later batches are written from.
   *
   * Kept on the pack because the browser is the only place it lives: nothing is
   * stored server-side, so a request for more questions has to carry the source
   * with it. Trimmed to MAX_MATERIAL_CHARS before it ever gets here.
   */
  material?: string;
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
