import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { toAgreementDoc, verificationSecret, type AgreementDetails, type AgreementRow } from "@/lib/agreement";

/**
 * Customer signing links. Public by design (customers have no portal login): every call
 * re-checks the secret link token, its expiry, and the customer's last 4 ID digits,
 * and locks the link after MAX_ATTEMPTS wrong codes.
 */
const MAX_ATTEMPTS = 5;
const tokenSchema = z.string().uuid();
const codeSchema = z.string().trim().regex(/^\d{4}$/, "Enter 4 digits");

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadByToken(token: string) {
  const sa = await admin();
  const { data: a } = await sa.from("loan_agreements").select("*").eq("sign_token", token).maybeSingle();
  if (!a || !a.sign_token_expires_at || new Date(a.sign_token_expires_at) < new Date()) {
    throw new Error("This signing link is invalid or has expired. Please contact H&M Consulting & Tech for a new link.");
  }
  return { sa, a };
}

async function verify(token: string, code: string) {
  const { sa, a } = await loadByToken(token);
  if (a.sign_attempts >= MAX_ATTEMPTS) throw new Error("This link has been locked after too many incorrect attempts. Please contact H&M for a new link.");
  const secret = verificationSecret((a.details ?? {}) as AgreementDetails);
  if (!secret.value || secret.value !== code) {
    await sa.from("loan_agreements").update({ sign_attempts: a.sign_attempts + 1 }).eq("id", a.id);
    const left = MAX_ATTEMPTS - a.sign_attempts - 1;
    throw new Error(left > 0 ? `Those digits don't match our records. ${left} attempt${left === 1 ? "" : "s"} left.` : "This link has now been locked. Please contact H&M for a new link.");
  }
  return { sa, a };
}

async function buildDoc(sa: Awaited<ReturnType<typeof admin>>, a: AgreementRow & { loan_id: string; customer_id: string }) {
  const [{ data: loan }, { data: cu }] = await Promise.all([
    sa.from("loans").select("*").eq("id", a.loan_id).maybeSingle(),
    sa.from("customers").select("account_number").eq("id", a.customer_id).maybeSingle(),
  ]);
  if (!loan) throw new Error("This loan could not be found.");
  return toAgreementDoc(a, loan as unknown as Record<string, unknown>, cu?.account_number ?? "");
}

/** Step 1: what the customer must enter, without revealing anything else. */
export const getSigningLinkInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { a } = await loadByToken(data.token);
    const secret = verificationSecret((a.details ?? {}) as AgreementDetails);
    return {
      agreement_number: a.agreement_number,
      prompt: secret.label,
      locked: a.sign_attempts >= MAX_ATTEMPTS,
      signed: !!a.customer_signed_at,
    };
  });

/** Step 2: after the 4-digit check, return the full agreement for reading and download. */
export const openSigningLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, code: codeSchema }).parse(d))
  .handler(async ({ data }) => {
    const { sa, a } = await verify(data.token, data.code);
    return buildDoc(sa, a);
  });

/** Step 3: record the customer's electronic signature. */
export const signViaLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        code: codeSchema,
        name: z.string().trim().min(3, "Enter your full name").max(120),
        place: z.string().trim().min(2, "Enter where you are signing").max(120),
        signature: z.string().startsWith("data:image/png;base64,").max(390_000),
        accepted: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { sa, a } = await verify(data.token, data.code);
    if (a.customer_signed_at) throw new Error("This agreement has already been signed.");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? null;
    const { data: updated, error } = await sa
      .from("loan_agreements")
      .update({
        customer_signature: data.signature,
        customer_signed_name: data.name,
        customer_signed_place: data.place,
        customer_signed_at: new Date().toISOString(),
        customer_sign_method: "remote",
        customer_sign_ip: ip,
        customer_sign_user_agent: (getRequestHeader("user-agent") ?? "").slice(0, 400),
      })
      .eq("id", a.id)
      .is("customer_signed_at", null)
      .select("*")
      .maybeSingle();
    if (error || !updated) throw new Error(error?.message ?? "Could not save your signature. Please try again.");
    return buildDoc(sa, updated);
  });
