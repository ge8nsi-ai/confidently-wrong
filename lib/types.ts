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
}
