import { describe, expect, test } from "bun:test"
import { fitOklch } from "./color"

describe("fitOklch", () => {
  test("keeps an in-gamut color unchanged", () => {
    const input = { l: 0.5, c: 0.1, h: 120 }

    const result = fitOklch(input)

    expect(result).toEqual(input)
  })

  test("reduces chroma for an out-of-gamut color", () => {
    const input = { l: 0.5, c: 1, h: 120 }

    const result = fitOklch(input)

    expect(result.c).toBeLessThanOrEqual(input.c)
    expect(result.l).toBeGreaterThanOrEqual(0)
    expect(result.l).toBeLessThanOrEqual(1)
  })
})