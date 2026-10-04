import { GUMROAD_PRODUCT_ID, GUMROAD_VERIFY_URL } from "./config";

/** Subset of the fetch API we need; the plugin adapts Obsidian's requestUrl to it, tests mock it. */
export type HttpPost = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ status: number; json(): Promise<unknown> }>;

export type LicenseStatus = "valid" | "invalid" | "refunded" | "unconfigured" | "error";

export interface LicenseResult {
  status: LicenseStatus;
  message: string;
}

interface GumroadPurchase {
  refunded?: boolean;
  chargebacked?: boolean;
  disputed?: boolean; // not in Gumroad's documented whitelist (checked 2026-10-02); harmless if absent
  subscription_ended_at?: string | null;
  subscription_cancelled_at?: string | null;
  subscription_failed_at?: string | null;
}

/**
 * ONE POST to Gumroad's licence endpoint. Called only when the user presses "Verify" or
 * "Re-check" in settings: never at startup, never on a timer. Sends only the product id and
 * the key the user typed (increment_uses_count=false); nothing else leaves the machine.
 * Refunded, charged-back and disputed purchases (and cancelled/failed subscriptions) are rejected.
 */
export async function verifyLicense(
  rawKey: string,
  post: HttpPost,
  productId: string = GUMROAD_PRODUCT_ID,
): Promise<LicenseResult> {
  const key = rawKey.trim();
  if (!productId) return { status: "unconfigured", message: "This build has no Pro product id configured." };
  if (key.length < 8 || key.length > 200 || /\s/.test(key)) return { status: "invalid", message: "That does not look like a licence key." };

  let res: Awaited<ReturnType<HttpPost>>;
  try {
    res = await post(GUMROAD_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: "false" }).toString(),
    });
  } catch {
    return { status: "error", message: "Could not reach Gumroad. Check your connection and try again." };
  }

  type Body = { success?: boolean; purchase?: GumroadPurchase };
  let data = null as Body | null;
  try {
    data = (await res.json()) as Body;
  } catch {
    /* handled below */
  }
  if (res.status === 404 || (data && data.success === false)) return { status: "invalid", message: "Gumroad does not recognise this licence key." };
  if (res.status < 200 || res.status >= 300 || !data || data.success !== true || !data.purchase)
    return { status: "error", message: "Unexpected answer from Gumroad. Try again later." };

  const p = data.purchase;
  if (p.refunded || p.chargebacked || p.disputed)
    return { status: "refunded", message: "This purchase was refunded, charged back or disputed, so Pro is not available for it." };
  if (p.subscription_ended_at || p.subscription_cancelled_at || p.subscription_failed_at) return { status: "refunded", message: "This licence is no longer active." };
  return { status: "valid", message: "Pro unlocked. Thank you!" };
}
