import { describe, expect, it } from "vitest"
import { extractLoginCodes, maskEmail, parseMuseBatch } from "./museBatch"

describe("parseMuseBatch", () => {
  it("accepts common separators and skips comments", () => {
    const { items, errors } = parseMuseBatch(
      [
        "# header",
        "a@example.com | https://generator.email/a@example.com",
        "b@example.com----https://generator.email/b@example.com",
        "c@example.com\thttps://generator.email/c@example.com",
        "",
        "// note"
      ].join("\n")
    )
    expect(errors).toEqual([])
    expect(items.map((i) => i.email)).toEqual(["a@example.com", "b@example.com", "c@example.com"])
    expect(items[0]?.line).toBe(2)
  })

  it("reports bad rows with their line numbers", () => {
    const { items, errors } = parseMuseBatch(
      ["nope | https://x.test/", "d@example.com", "e@example.com | http://x.test/", "f@example.com | https://x.test/", "F@example.com | https://x.test/"].join("\n")
    )
    expect(items).toHaveLength(1)
    expect(errors).toEqual([
      { line: 1, reason: "bad-email" },
      { line: 2, reason: "missing-inbox" },
      { line: 3, reason: "bad-url" },
      { line: 5, reason: "duplicate" }
    ])
  })
})

describe("extractLoginCodes", () => {
  it("finds codes in English and Chinese mails, newest first", () => {
    const text = "Your code is 123456\n验证码：654321\n111222 is your Meta code"
    expect(extractLoginCodes(text)).toEqual(["123456", "654321", "111222"])
  })

  it("ignores longer digit runs", () => {
    expect(extractLoginCodes("order 12345678 code 1234567")).toEqual([])
  })
})

describe("maskEmail", () => {
  it("keeps only a short prefix", () => {
    expect(maskEmail("someone@example.com")).toBe("som***@example.com")
  })
})
