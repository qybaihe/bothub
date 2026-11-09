import { describe, expect, it } from "vitest"
import {
  extractLoginCodes,
  maskEmail,
  MUSE_AUTO_LOGIN_MAX_ATTEMPTS,
  parseMuseBatch,
  pickFreshCode,
  retryDelayMs,
  shouldAutoRetry
} from "./museBatch"

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

describe("pickFreshCode", () => {
  it("returns the first code that was not in the baseline", () => {
    expect(pickFreshCode(["111111"], ["222222", "111111"])).toBe("222222")
  })

  it("does not accept a stale code just because the baseline was empty-er", () => {
    expect(pickFreshCode(["111111"], ["111111", "111111"])).toBeUndefined()
  })
})

describe("retry policy", () => {
  it("retries transient failures up to the attempt cap", () => {
    expect(shouldAutoRetry("code-timeout", 1)).toBe(true)
    expect(shouldAutoRetry("inbox-unreachable", 2)).toBe(true)
    expect(shouldAutoRetry("code-timeout", MUSE_AUTO_LOGIN_MAX_ATTEMPTS)).toBe(false)
  })

  it("never retries human checks or cancels", () => {
    expect(shouldAutoRetry("needs-human", 1)).toBe(false)
    expect(shouldAutoRetry("cancelled", 1)).toBe(false)
    expect(shouldAutoRetry(undefined, 1)).toBe(false)
  })

  it("backs off exponentially with a cap", () => {
    const zero = () => 0
    expect(retryDelayMs(1, zero)).toBe(4_000)
    expect(retryDelayMs(2, zero)).toBe(8_000)
    expect(retryDelayMs(10, zero)).toBe(30_000)
    expect(retryDelayMs(1, () => 0.999)).toBeLessThan(5_000)
  })
})

describe("maskEmail", () => {
  it("keeps only a short prefix", () => {
    expect(maskEmail("someone@example.com")).toBe("som***@example.com")
  })
})
