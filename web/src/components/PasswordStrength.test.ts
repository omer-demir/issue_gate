import { describe, expect, it } from "vitest";
import { estimatePasswordStrength, MIN_MASTER_PASSWORD_SCORE } from "./PasswordStrength";

describe("estimatePasswordStrength (MSM-4 AC2)", () => {
  it("flags short/simple passwords as below the minimum score", () => {
    const { score, reasons } = estimatePasswordStrength("abc");
    expect(score).toBeLessThan(MIN_MASTER_PASSWORD_SCORE);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("accepts a long, varied password", () => {
    const { score } = estimatePasswordStrength("Tr0ub4dor&3-Correct-Horse!");
    expect(score).toBeGreaterThanOrEqual(MIN_MASTER_PASSWORD_SCORE);
  });
});
