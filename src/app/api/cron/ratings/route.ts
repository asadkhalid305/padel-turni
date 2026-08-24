import { runRatingWorker } from "@/lib/rating-worker";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // Authentication must stay above this boundary: an unauthorized request is
  // rejected without creating a service-role client or touching the database.
  const client = createServerClient();
  if (!client) {
    return json({ ok: false, error: "Worker unavailable" }, 503);
  }

  try {
    const result = await runRatingWorker({ client });
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, error: "Rating worker failed" }, 500);
  }
}
