"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * The Phase 1 demo is local-first so it works without credentials.
 * This helper is the entry point for wiring the same UI to the production
 * schema in `supabase/schema.sql`:
 *
 *   const supabase = getSupabaseBrowserClient();
 *   if (!supabase) fall back to the local repository;
 *   await supabase.auth.signInWithPassword(...);
 *   await supabase.from("products").select("*").eq("business_id", businessId);
 */
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
 * Upload a compressed parchi JPEG to the private bucket using the tenant path
 * convention enforced by the storage RLS policies.
 * Requires an authenticated Supabase session in the browser.
 */
export async function uploadParchiImage({
  businessId,
  dataUrl,
  transactionKey,
}: {
  businessId: string;
  dataUrl: string;
  transactionKey: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const blob = await (await fetch(dataUrl)).blob();
  const date = new Date().toISOString().slice(0, 10);
  const safeKey = transactionKey.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${businessId}/${date}/${safeKey}.jpg`;

  const { error } = await supabase.storage
    .from("parchi-images")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  const { data, error: signedError } = await supabase.storage
    .from("parchi-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signedError) throw signedError;

  return { path, signedUrl: data.signedUrl };
}
