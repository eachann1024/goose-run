import { describe, expect, it } from "vitest";
import { extractPort } from "../port-detect";

describe("extractPort — 正例", () => {
  it("localhost:6003", () => {
    expect(extractPort("localhost:6003")).toBe(6003);
  });

  it("http://127.0.0.1:8080/", () => {
    expect(extractPort("http://127.0.0.1:8080/")).toBe(8080);
  });

  it("0.0.0.0:5173", () => {
    expect(extractPort("0.0.0.0:5173")).toBe(5173);
  });

  it("Listening on port 3000", () => {
    expect(extractPort("Listening on port 3000")).toBe(3000);
  });

  it("带时间戳：[2026-05-30T12:00:05] listening on http://localhost:6003（应抓 6003，不被时间戳里的数字带偏）", () => {
    // pattern1/2 优先级高于 pattern4，localhost:6003 由 pattern1 先命中
    expect(extractPort("[2026-05-30T12:00:05] listening on http://localhost:6003")).toBe(6003);
  });

  it("Server running at http://localhost:4321/", () => {
    expect(extractPort("Server running at http://localhost:4321/")).toBe(4321);
  });
});

describe("extractPort — 负例（防误抓）", () => {
  it("纯版本号 v18.20.3 → null", () => {
    expect(extractPort("v18.20.3")).toBeNull();
  });

  it("ISO 时间 2026-05-30 12:00:00 → null", () => {
    expect(extractPort("2026-05-30 12:00:00")).toBeNull();
  });

  it("pid 12345 → null", () => {
    expect(extractPort("pid 12345")).toBeNull();
  });

  it("exit code 0 → null", () => {
    expect(extractPort("exit code 0")).toBeNull();
  });

  it("空字符串 → null", () => {
    expect(extractPort("")).toBeNull();
  });

  it("done in 1.2s → null", () => {
    expect(extractPort("done in 1.2s")).toBeNull();
  });
});

describe("extractPort — 边界端口", () => {
  it("端口 0（一位数，不满足 \\d{2,5}）→ null", () => {
    expect(extractPort("localhost:0")).toBeNull();
  });

  it("端口 70000（超 65535）→ null", () => {
    expect(extractPort("localhost:70000")).toBeNull();
  });

  it("端口 1（最小合法端口，两位以上要求不满足 \\d{2,5}）→ null", () => {
    // \d{2,5} 要求至少两位，单位数端口无法通过 pattern1
    expect(extractPort("localhost:1")).toBeNull();
  });

  it("端口 65535（最大合法端口）→ 65535", () => {
    expect(extractPort("localhost:65535")).toBe(65535);
  });
});
