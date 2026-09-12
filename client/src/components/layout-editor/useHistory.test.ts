import { describe, expect, it } from "vitest";
import {
  HISTORY_CAP,
  canRedo,
  canUndo,
  createHistory,
  historyKeyAction,
  historyPush,
  historyRedo,
  historyReplace,
  historyReset,
  historyUndo,
} from "./useHistory";

interface Doc {
  n: number;
}

const d = (n: number): Doc => ({ n });

describe("history push / undo / redo", () => {
  it("starts with nothing to undo or redo", () => {
    const h = createHistory(d(0));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual(d(0));
  });

  it("push records the previous present and clears the future", () => {
    let h = createHistory(d(0));
    h = historyPush(h, d(1));
    h = historyPush(h, d(2));
    expect(h.past.map((x) => x.n)).toEqual([0, 1]);
    expect(h.present.n).toBe(2);
    h = historyUndo(h);
    expect(h.future.map((x) => x.n)).toEqual([2]);
    h = historyPush(h, d(9));
    expect(h.future).toEqual([]);
    expect(h.past.map((x) => x.n)).toEqual([0, 1]);
    expect(h.present.n).toBe(9);
  });

  it("push of the identical present is a no-op (same reference)", () => {
    const h0 = createHistory(d(0));
    const h1 = historyPush(h0, h0.present);
    expect(h1).toBe(h0);
  });

  it("undo then redo restores the exact snapshot references", () => {
    const a = d(0);
    const b = d(1);
    let h = createHistory(a);
    h = historyPush(h, b);
    h = historyUndo(h);
    expect(h.present).toBe(a);
    expect(canRedo(h)).toBe(true);
    h = historyRedo(h);
    expect(h.present).toBe(b);
    expect(canRedo(h)).toBe(false);
    expect(canUndo(h)).toBe(true);
  });

  it("undo / redo at the ends are no-ops", () => {
    const h = createHistory(d(0));
    expect(historyUndo(h)).toBe(h);
    expect(historyRedo(h)).toBe(h);
  });

  it("does not mutate earlier states (immutable snapshots)", () => {
    const h0 = createHistory(d(0));
    const h1 = historyPush(h0, d(1));
    const h2 = historyPush(h1, d(2));
    expect(h0.past).toEqual([]);
    expect(h0.present.n).toBe(0);
    expect(h1.past.length).toBe(1);
    expect(h1.future).toEqual([]);
    expect(h2.past.length).toBe(2);
  });

  it("caps the past at HISTORY_CAP, dropping the oldest", () => {
    let h = createHistory(d(0));
    for (let i = 1; i <= HISTORY_CAP + 25; i++) h = historyPush(h, d(i));
    expect(h.past.length).toBe(HISTORY_CAP);
    expect(h.past[0].n).toBe(25);
    expect(h.present.n).toBe(HISTORY_CAP + 25);
    // Can undo exactly HISTORY_CAP times.
    let steps = 0;
    while (canUndo(h)) {
      h = historyUndo(h);
      steps++;
    }
    expect(steps).toBe(HISTORY_CAP);
    expect(h.present.n).toBe(25);
  });

  it("accepts a custom cap", () => {
    let h = createHistory(d(0));
    for (let i = 1; i <= 10; i++) h = historyPush(h, d(i), 3);
    expect(h.past.map((x) => x.n)).toEqual([7, 8, 9]);
  });
});

describe("replace and reset", () => {
  it("replace swaps the present without adding a step", () => {
    let h = createHistory(d(0));
    h = historyPush(h, d(1));
    h = historyReplace(h, d(5));
    expect(h.present.n).toBe(5);
    expect(h.past.map((x) => x.n)).toEqual([0]);
    h = historyUndo(h);
    expect(h.present.n).toBe(0);
  });

  it("reset clears both stacks", () => {
    let h = createHistory(d(0));
    h = historyPush(h, d(1));
    h = historyPush(h, d(2));
    h = historyUndo(h);
    h = historyReset(h, d(42));
    expect(h.present.n).toBe(42);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("reset with the same present on an empty history is a no-op", () => {
    const h = createHistory(d(0));
    expect(historyReset(h, h.present)).toBe(h);
  });
});

describe("keyboard mapping", () => {
  it("Cmd/Ctrl+Z undoes, Shift+Z redoes, Ctrl+Y redoes", () => {
    expect(historyKeyAction({ key: "z", metaKey: true })).toBe("undo");
    expect(historyKeyAction({ key: "z", ctrlKey: true })).toBe("undo");
    expect(historyKeyAction({ key: "Z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(historyKeyAction({ key: "z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(historyKeyAction({ key: "y", ctrlKey: true })).toBe("redo");
  });

  it("ignores plain keys, alt combos and Cmd+Y", () => {
    expect(historyKeyAction({ key: "z" })).toBeNull();
    expect(historyKeyAction({ key: "z", metaKey: true, altKey: true })).toBeNull();
    expect(historyKeyAction({ key: "y", metaKey: true })).toBeNull();
    expect(historyKeyAction({ key: "a", metaKey: true })).toBeNull();
  });
});
