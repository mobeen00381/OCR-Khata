"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Direct browser upload helper for an authenticated Supabase session.
 * The app's default persistence path uses the server proxy so it works without
 * a login screen, but this remains available for an auth-backed deployment.
 */
export async function uploadBillImage({
  businessId,
  dataUrl,
  transactionKey,
}: {
  businessId: string;
  dataUrl: string;
  transactionKey: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase browser client is not configured.");

  const blob = await (await fetch(dataUrl)).blob();
  const date = new Date().toISOString().slice(0, 10);
  const safeKey = transactionKey.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${businessId}/${date}/${Date.now()}-${safeKey}.jpg`;

  const { error } = await supabase.storage
    .from("bill-images")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  const { data, error: signedError } = await supabase.storage
    .from("bill-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signedError) throw signedError;

  return { path, signedUrl: data.signedUrl };
}
