import { describe, expect, it } from "vitest";
import { PACKS } from "./packs";
import { hasRewording, toVariant } from "./variants";

describe("content packs", () => {
  it("ships exactly three packs with unique ids", () => {
    expect(PACKS).toHaveLength(3);
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(3);
  });

  for (const pack of PACKS) {
    describe(pack.id, () => {
      it("has a title, blurb, and 6-8 items", () => {
        expect(pack.title.length).toBeGreaterThan(0);
        expect(pack.blurb.length).toBeGreaterThan(0);
        expect(pack.items.length).toBeGreaterThanOrEqual(6);
        expect(pack.items.length).toBeLessThanOrEqual(8);
      });

      it("has unique item ids", () => {
        const ids = pack.items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      for (const item of pack.items) {
        describe(item.id, () => {
          it("has exactly one correct option", () => {
            expect(item.options.filter((o) => o.correct)).toHaveLength(1);
          });

          it("has at least three options with unique ids and non-empty text", () => {
            expect(item.options.length).toBeGreaterThanOrEqual(3);
            expect(new Set(item.options.map((o) => o.id)).size).toBe(
              item.options.length,
            );
            for (const o of item.options) expect(o.text.trim()).not.toBe("");
          });

          it("names the misconception behind every incorrect option", () => {
            for (const o of item.options.filter((x) => !x.correct)) {
              expect(o.misconception, `${item.id}/${o.id}`).toBeTruthy();
              expect(o.misconception!.trim().length).toBeGreaterThan(10);
            }
          });

          it("never labels a correct option with a misconception", () => {
            for (const o of item.options.filter((x) => x.correct)) {
              expect(o.misconception).toBeUndefined();
            }
          });

          it("has a complete hand-written fallback refutation", () => {
            const f = item.fallbackRefutation;
            expect(f).toBeTruthy();
            for (const key of ["believe", "wrong", "actual"] as const) {
              expect(f[key].trim().length, `${item.id}.${key}`).toBeGreaterThan(20);
            }
          });

          it("has a hand-written recheck rewording", () => {
            expect(hasRewording(item.id)).toBe(true);
            const v = toVariant(item);
            expect(v.stem).not.toBe(item.stem);
            expect(v.variantOf).toBe(item.id);
            expect(v.options.filter((o) => o.correct)).toHaveLength(1);
            expect(v.options.map((o) => o.id).sort()).toEqual(
              item.options.map((o) => o.id).sort(),
            );
          });
        });
      }
    });
  }
});
