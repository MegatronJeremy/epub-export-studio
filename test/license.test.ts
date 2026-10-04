import { describe, expect, it, vi } from "vitest";
import { verifyLicense, type HttpPost } from "../src/license";

const ok = (purchase: Record<string, unknown> = {}) => ({ status: 200, json: async () => ({ success: true, purchase: { refunded: false, chargebacked: false, disputed: false, ...purchase } }) });
const mock = (r: Awaited<ReturnType<HttpPost>> | Error) => vi.fn<HttpPost>(async () => { if (r instanceof Error) throw r; return r; });
const KEY = "ABCD1234-EFGH5678";

describe("verifyLicense", () => {
  it("accepts a good purchase with exactly one POST to the Gumroad endpoint", async () => {
    const post = mock(ok());
    const r = await verifyLicense(KEY, post, "prod123");
    expect(r.status).toBe("valid");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0];
    expect(url).toBe("https://api.gumroad.com/v2/licenses/verify");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body);
    expect([...body.keys()].sort()).toEqual(["increment_uses_count", "license_key", "product_id"]);
    expect(body.get("license_key")).toBe(KEY);
    expect(body.get("product_id")).toBe("prod123");
    expect(body.get("increment_uses_count")).toBe("false");
  });
  it.each([["refunded"], ["chargebacked"], ["disputed"]])("rejects a %s purchase", async (flag) => {
    expect((await verifyLicense(KEY, mock(ok({ [flag]: true })), "p")).status).toBe("refunded");
  });
  it("rejects cancelled subscriptions", async () => {
    expect((await verifyLicense(KEY, mock(ok({ subscription_ended_at: "2026-01-01" })), "p")).status).toBe("refunded");
    expect((await verifyLicense(KEY, mock(ok({ subscription_cancelled_at: "2026-01-01" })), "p")).status).toBe("refunded");
  });
  it("rejects unknown keys (404 / success:false)", async () => {
    expect((await verifyLicense(KEY, mock({ status: 404, json: async () => ({ success: false }) }), "p")).status).toBe("invalid");
    expect((await verifyLicense(KEY, mock({ status: 200, json: async () => ({ success: false }) }), "p")).status).toBe("invalid");
  });
  it("reports network errors and malformed answers without unlocking", async () => {
    expect((await verifyLicense(KEY, mock(new Error("offline")), "p")).status).toBe("error");
    expect((await verifyLicense(KEY, mock({ status: 500, json: async () => ({}) }), "p")).status).toBe("error");
    expect((await verifyLicense(KEY, mock({ status: 200, json: async () => { throw new Error("x"); } }), "p")).status).toBe("error");
    expect((await verifyLicense(KEY, mock({ status: 200, json: async () => ({ success: true }) }), "p")).status).toBe("error");
  });
  it("makes no call for junk keys or without a configured product id", async () => {
    const post = mock(ok());
    expect((await verifyLicense("  short ", post, "p")).status).toBe("invalid");
    expect((await verifyLicense("has space in it key", post, "p")).status).toBe("invalid");
    expect((await verifyLicense(KEY, post, "")).status).toBe("unconfigured");
    expect(post).not.toHaveBeenCalled();
  });
});
