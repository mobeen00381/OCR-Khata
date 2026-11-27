import { NextResponse } from "next/server";
import {
  findActiveBusiness,
  loadWorkspaceState,
  persistRemoteDayLock,
  persistRemoteParty,
  persistRemotePayment,
  persistRemoteProduct,
  persistRemoteTransaction,
  seedDemoWorkspace,
  type RemoteTransactionInput,
} from "@/lib/supabase/workspace";
import {
  getSupabaseServerClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface WorkspaceActionBody {
  action?: string;
  payload?: Record<string, unknown>;
}

function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 800) : "Unknown workspace error.";
}

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({
      configured: false,
      empty: false,
      businessId: null,
      state: null,
    });
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      { configured: true, error: "Supabase server client could not start." },
      { status: 500 },
    );
  }

  try {
    const business = await findActiveBusiness(client);
    if (!business) {
      return NextResponse.json({
        configured: true,
        empty: true,
        businessId: null,
        state: null,
      });
    }
    const snapshot = await loadWorkspaceState(client, String(business.id));
    return NextResponse.json({
      configured: true,
      empty: !snapshot,
      businessId: String(business.id),
      state: snapshot?.state ?? null,
    });
  } catch (error) {
    console.error("[workspace:GET]", error);
    return NextResponse.json(
      {
        configured: true,
        error: message(error),
        businessId: null,
        state: null,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supabase is not configured on the server. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: "Supabase server client could not start." },
      { status: 500 },
    );
  }

  let body: WorkspaceActionBody;
  try {
    body = (await request.json()) as WorkspaceActionBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid workspace request." },
      { status: 400 },
    );
  }

  const action = body.action || "";
  const payload = body.payload || {};

  try {
    if (action === "seed_demo") {
      const snapshot = await seedDemoWorkspace(client);
      return NextResponse.json({
        success: true,
        state: snapshot.state,
        businessId: snapshot.businessId,
      });
    }

    const business = await findActiveBusiness(client);
    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase is connected but the workspace is empty. Load Demo Shop Data from the dashboard first.",
        },
        { status: 409 },
      );
    }
    const businessId = String(business.id);

    if (action === "save_transaction") {
      const input = payload as unknown as RemoteTransactionInput;
      if (!input.party_id || !Array.isArray(input.items) || !input.items.length) {
        return NextResponse.json(
          { success: false, error: "Transaction requires a party and line items." },
          { status: 400 },
        );
      }
      const result = await persistRemoteTransaction(client, businessId, input);
      return NextResponse.json({
        success: true,
        transactionId: result.transactionId,
        state: result.state,
        warning: result.warning,
      });
    }

    if (action === "add_product" || action === "update_product") {
      const product = payload.product as
        | Parameters<typeof persistRemoteProduct>[2]
        | undefined;
      if (!product) {
        return NextResponse.json(
          { success: false, error: "Product payload missing." },
          { status: 400 },
        );
      }
      const result = await persistRemoteProduct(client, businessId, product);
      return NextResponse.json({
        success: true,
        product: result.product,
        state: result.state,
      });
    }

    if (action === "add_party") {
      const party = payload.party as
        | Parameters<typeof persistRemoteParty>[2]
        | undefined;
      if (!party) {
        return NextResponse.json(
          { success: false, error: "Party payload missing." },
          { status: 400 },
        );
      }
      const result = await persistRemoteParty(client, businessId, party);
      return NextResponse.json({
        success: true,
        party: result.party,
        state: result.state,
      });
    }

    if (action === "record_payment") {
      const payment = payload.payment as Parameters<typeof persistRemotePayment>[2];
      if (!payment || Number(payment.amount) <= 0) {
        return NextResponse.json(
          { success: false, error: "A valid payment amount is required." },
          { status: 400 },
        );
      }
      const state = await persistRemotePayment(client, businessId, payment);
      return NextResponse.json({ success: true, state });
    }

    if (action === "close_day" || action === "reopen_day") {
      const date = String(payload.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { success: false, error: "A valid closing date is required." },
          { status: 400 },
        );
      }
      const state = await persistRemoteDayLock(
        client,
        businessId,
        date,
        Number(payload.opening_cash) || 0,
        action === "reopen_day",
      );
      return NextResponse.json({ success: true, state });
    }

    return NextResponse.json(
      { success: false, error: `Unknown workspace action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    console.error("[workspace:POST]", action, error);
    return NextResponse.json(
      { success: false, error: message(error) },
      { status: 500 },
    );
  }
}
