import { describe, it, expect } from "vitest";
import { CONTRACTS, checkMean, detectChanges } from "@/lib/drift";

describe("price contract", () => {
  it("accepts means within 100–200", () => {
    expect(checkMean(100, CONTRACTS[0]!)).toBe(true);
    expect(checkMean(200, CONTRACTS[0]!)).toBe(true);
  });
  it("flags means outside 100–200", () => {
    expect(checkMean(99.9, CONTRACTS[0]!)).toBe(false);
    expect(checkMean(15000, CONTRACTS[0]!)).toBe(false);
  });
  it("adding a nullable column is not breaking", () => {
    expect(detectChanges(CONTRACTS[0]!, CONTRACTS[1]!).every((c) => c.kind === "safe")).toBe(true);
  });
  it("removing a column is breaking", () => {
    expect(detectChanges(CONTRACTS[1]!, CONTRACTS[2]!).some((c) => c.message.includes('"currency" removed'))).toBe(true);
  });
});
