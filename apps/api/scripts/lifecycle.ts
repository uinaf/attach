const MIN_OBJECT_AGE_SECONDS = 760 * 24 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasRequiredObjectLifecycle(payload: unknown): boolean {
  const result = isRecord(payload) && isRecord(payload.result) ? payload.result : payload;
  if (!isRecord(result) || !Array.isArray(result.rules)) return false;

  return result.rules.some((rule) => {
    if (!isRecord(rule) || rule.enabled !== true || !isRecord(rule.conditions)) return false;
    if (rule.conditions.prefix !== "" || !isRecord(rule.deleteObjectsTransition)) return false;
    const condition = rule.deleteObjectsTransition.condition;
    return (
      isRecord(condition) &&
      condition.type === "Age" &&
      typeof condition.maxAge === "number" &&
      condition.maxAge >= MIN_OBJECT_AGE_SECONDS
    );
  });
}

export async function requireObjectLifecycle(args: {
  accountId: string;
  apiToken: string;
  bucket: string;
  jurisdiction: string;
}): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(args.accountId)}/r2/buckets/${encodeURIComponent(args.bucket)}/lifecycle`,
    {
      headers: {
        Authorization: `Bearer ${args.apiToken}`,
        "cf-r2-jurisdiction": args.jurisdiction,
      },
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`r2_lifecycle_check_failed:${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!hasRequiredObjectLifecycle(payload)) {
    throw new Error(
      "r2_lifecycle_missing: require enabled all-prefix delete after at least 760 days",
    );
  }
}
