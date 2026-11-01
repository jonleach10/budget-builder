import { createBrowserClient } from "@supabase/ssr";
import { authErrorMessage } from "./authErrorMessage";
import type { AuthResult, MfaClient } from "./mfa";
import { supabaseEnv } from "./supabaseEnv";

function browserClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}

export function browserMfa(): MfaClient {
  return browserClient().auth.mfa;
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await browserClient().auth.signInWithPassword({
    email,
    password,
  });
  return error
    ? { ok: false, message: authErrorMessage(error) }
    : { ok: true };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await browserClient().auth.signOut();
  return error
    ? { ok: false, message: authErrorMessage(error) }
    : { ok: true };
}
