import { COMPANY } from "./company";
import { buildSchedule, type Frequency } from "./finance";

/** Customer and signing details the manager fills in. Empty values print as blank lines. */
export type AgreementDetails = Partial<Record<AgreementFieldKey, string>>;

export const AGREEMENT_FIELDS = [
  { key: "full_name", label: "Full names and surname", section: "personal", wide: true },
  { key: "id_number", label: "SA ID / passport number", section: "personal" },
  { key: "date_of_birth", label: "Date of birth", section: "personal" },
  { key: "phone", label: "Cellphone number", section: "personal" },
  { key: "alt_phone", label: "Alternative number", section: "personal" },
  { key: "email", label: "Email address", section: "personal", wide: true },
  { key: "residential_address", label: "Residential address (chosen address for notices)", section: "personal", wide: true },
  { key: "postal_address", label: "Postal address", section: "personal", wide: true },
  { key: "employer", label: "Employer", section: "employment" },
  { key: "job_title", label: "Occupation / job title", section: "employment" },
  { key: "employer_phone", label: "Employer contact number", section: "employment" },
  { key: "monthly_income", label: "Gross monthly income (R)", section: "employment" },
  { key: "pay_day", label: "Salary pay day", section: "employment" },
  { key: "payment_method", label: "Repayment method", section: "employment" },
  { key: "bank_name", label: "Bank", section: "bank" },
  { key: "bank_account_type", label: "Account type", section: "bank" },
  { key: "bank_account_number", label: "Account number", section: "bank" },
  { key: "bank_branch_code", label: "Branch code", section: "bank" },
  { key: "nok_name", label: "Next of kin full name", section: "kin" },
  { key: "nok_relationship", label: "Relationship", section: "kin" },
  { key: "nok_phone", label: "Next of kin contact number", section: "kin" },
  { key: "signing_place", label: "Place of signing", section: "signing" },
  { key: "rep_name", label: "H&M representative", section: "signing" },
  { key: "rep_title", label: "Representative's position", section: "signing" },
  { key: "witness_name", label: "Witness full name", section: "signing" },
  { key: "special_conditions", label: "Special conditions (optional)", section: "signing", wide: true },
] as const;

export type AgreementFieldKey = (typeof AGREEMENT_FIELDS)[number]["key"];

export const FIELD_SECTIONS = [
  { id: "personal", title: "Personal information" },
  { id: "employment", title: "Employment and income" },
  { id: "bank", title: "Bank details (for disbursement and debit order)" },
  { id: "kin", title: "Next of kin" },
  { id: "signing", title: "Signing details" },
] as const;

export type AgreementTerms = {
  loan_reference: string;
  principal: number;
  interest_rate: number;
  interest_amount: number;
  fees: number;
  total_repayable: number;
  instalment_amount: number;
  number_of_instalments: number;
  repayment_frequency: Frequency;
  first_payment_date: string;
  maturity_date: string | null;
  issue_date: string;
  purpose: string | null;
};

export type SignatureRecord = {
  image: string | null;
  name: string;
  title?: string | null;
  place: string | null;
  at: string | null;
};

export type AgreementDoc = {
  id: string;
  agreement_number: string;
  created_at: string;
  account_number: string;
  details: AgreementDetails;
  terms: AgreementTerms;
  /** True when the terms were frozen at the moment the customer signed. */
  termsLocked: boolean;
  customer: (SignatureRecord & { method: "remote" | "in_person" | "paper"; ip: string | null }) | null;
  rep: SignatureRecord | null;
  witness: SignatureRecord | null;
  hash: string | null;
};

type Num = number | string | null | undefined;
const n = (v: Num) => Number(v ?? 0);

/** Loan row (live or frozen) → agreement terms. */
export function toTerms(l: Record<string, unknown>): AgreementTerms {
  return {
    loan_reference: String(l["loan_reference"] ?? ""),
    principal: n(l["principal"] as Num),
    interest_rate: n(l["interest_rate"] as Num),
    interest_amount: n(l["interest_amount"] as Num),
    fees: n(l["fees"] as Num),
    total_repayable: n(l["total_repayable"] as Num),
    instalment_amount: n(l["instalment_amount"] as Num),
    number_of_instalments: Math.max(1, n(l["number_of_instalments"] as Num)),
    repayment_frequency: (l["repayment_frequency"] as Frequency) ?? "monthly",
    first_payment_date: String(l["first_payment_date"] ?? ""),
    maturity_date: (l["maturity_date"] as string | null) ?? null,
    issue_date: String(l["issue_date"] ?? ""),
    purpose: (l["purpose"] as string | null) ?? null,
  };
}

export type AgreementRow = {
  id: string;
  agreement_number: string;
  created_at: string;
  details: unknown;
  signed_terms: unknown;
  signed_hash: string | null;
  customer_signature: string | null;
  customer_signed_name: string | null;
  customer_signed_place: string | null;
  customer_signed_at: string | null;
  customer_sign_method: string | null;
  customer_sign_ip: string | null;
  rep_signature: string | null;
  rep_name: string | null;
  rep_title: string | null;
  rep_signed_place: string | null;
  rep_signed_at: string | null;
  witness_signature: string | null;
  witness_name: string | null;
  witness_signed_place: string | null;
  witness_signed_at: string | null;
};

/** One mapping used by the portal and the customer's signing page, so both PDFs are identical. */
export function toAgreementDoc(a: AgreementRow, loan: Record<string, unknown>, accountNumber: string): AgreementDoc {
  const locked = !!a.signed_terms && typeof a.signed_terms === "object";
  return {
    id: a.id,
    agreement_number: a.agreement_number,
    created_at: a.created_at,
    account_number: accountNumber,
    details: (a.details ?? {}) as AgreementDetails,
    terms: toTerms(locked ? (a.signed_terms as Record<string, unknown>) : loan),
    termsLocked: locked,
    customer: a.customer_signed_at
      ? { image: a.customer_signature, name: a.customer_signed_name ?? "", place: a.customer_signed_place, at: a.customer_signed_at, method: (a.customer_sign_method ?? "in_person") as "remote" | "in_person" | "paper", ip: a.customer_sign_ip }
      : null,
    rep: a.rep_signed_at ? { image: a.rep_signature, name: a.rep_name ?? "", title: a.rep_title, place: a.rep_signed_place, at: a.rep_signed_at } : null,
    witness: a.witness_signed_at ? { image: a.witness_signature, name: a.witness_name ?? "", place: a.witness_signed_place, at: a.witness_signed_at } : null,
    hash: a.signed_hash,
  };
}

export function agreementSchedule(t: AgreementTerms) {
  if (!t.first_payment_date) return [];
  let remaining = t.total_repayable;
  return buildSchedule(t.first_payment_date, t.repayment_frequency, t.number_of_instalments, t.instalment_amount, t.total_repayable).map((s) => {
    remaining = Math.round((remaining - s.amount) * 100) / 100;
    return { ...s, remaining: Math.max(0, remaining) };
  });
}

export type AgreementStatus = "prepared" | "awaiting_customer" | "customer_signed" | "completed";

export function agreementStatus(doc: Pick<AgreementDoc, "customer" | "rep">, hasLink: boolean): AgreementStatus {
  if (doc.customer && doc.rep) return "completed";
  if (doc.customer) return "customer_signed";
  return hasLink ? "awaiting_customer" : "prepared";
}

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  prepared: "Prepared — awaiting signature",
  awaiting_customer: "Signing link sent to customer",
  customer_signed: "Signed by customer — awaiting H&M",
  completed: "Fully signed",
};

/** The value the customer must type to open their signing link: last 4 digits of their ID number, else of their cellphone. */
export function verificationSecret(details: AgreementDetails): { label: string; value: string } {
  const id = (details.id_number ?? "").replace(/\D/g, "");
  if (id.length >= 4) return { label: "the last 4 digits of your ID number", value: id.slice(-4) };
  const phone = (details.phone ?? "").replace(/\D/g, "");
  return { label: "the last 4 digits of your cellphone number", value: phone.slice(-4) };
}

/** SA ID number → date of birth (YYYY-MM-DD), assuming anyone born "after" this year was born last century. */
export function dobFromSaId(id: string | null | undefined): string {
  const d = (id ?? "").replace(/\D/g, "");
  if (d.length !== 13) return "";
  const yy = Number(d.slice(0, 2));
  const century = yy > new Date().getFullYear() % 100 ? 1900 : 2000;
  return `${century + yy}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" };

/** Numbered terms and conditions printed on every agreement. */
export function agreementTerms(): { title: string; text: string }[] {
  const cp = COMPANY.name;
  return [
    { title: "Parties and interpretation", text: `This agreement is entered into between ${cp} ("H&M", "the Credit Provider") and the person named in Part B ("the Customer"). Headings are for reference only. Words in the singular include the plural.` },
    { title: "The loan", text: "H&M agrees to lend the Customer the principal amount set out in Part C. The loan is paid into the Customer's bank account in Part B, or as otherwise recorded by H&M, once the loan has been approved and this agreement has been signed by both parties." },
    { title: "Interest", text: "Interest is charged at the flat rate shown in Part C, calculated on the principal amount for the full term of the loan. The interest rate will not exceed the maximum rate prescribed under the National Credit Act 34 of 2005 and its regulations." },
    { title: "Fees", text: "The fees shown in Part C are the only fees payable under this agreement. H&M will not charge any fee that is not disclosed in Part C or permitted by law." },
    { title: "Total amount repayable", text: "The total amount repayable is the principal, interest and fees shown in Part C. It is the full cost of credit under this agreement if all instalments are paid on time." },
    { title: "Repayment", text: "The Customer must pay each instalment in full on or before its due date as set out in the repayment schedule in Part D, using the repayment method in Part B. Payments are credited first to interest due, then to fees and charges, and then to the principal, as required by section 126 of the National Credit Act." },
    { title: "Proof of payment", text: "The Customer must use the loan reference as the payment reference and keep proof of every payment. H&M will issue a statement of account on request and at least once every three months." },
    { title: "Early settlement", text: "The Customer may settle the loan at any time, in whole or in part, without penalty. On request H&M will provide a settlement figure within five business days." },
    { title: "Late or missed payments", text: "If an instalment is not paid on its due date, the amount becomes arrears. H&M may charge default administration charges and collection costs only as permitted by the National Credit Act." },
    { title: "Default and enforcement", text: "If the Customer is in default, H&M may deliver a written notice in terms of section 129 of the National Credit Act proposing that the Customer refers the agreement to a debt counsellor, dispute resolution agent, consumer court or ombud. H&M will not begin legal proceedings until at least 10 business days after delivering that notice and the Customer has been in default for at least 20 business days." },
    { title: "Credit bureau reporting", text: "The Customer agrees that H&M may obtain credit information about them and report the conduct of this account, including arrears and defaults, to registered credit bureaux. H&M will give the Customer at least 20 business days' notice before reporting adverse information." },
    { title: "Customer warranties", text: "The Customer confirms that all information provided to H&M is true and complete; that they can afford the instalments after their living expenses and other debt obligations; and that they are not under debt review, sequestration or administration." },
    { title: "Right to debt counselling", text: "The Customer may apply to a registered debt counsellor at any time to be declared over-indebted. The Customer may contact the National Credit Regulator (www.ncr.org.za) for information about their rights." },
    { title: "Personal information (POPIA)", text: "The Customer consents to H&M processing their personal information to assess, administer and collect this loan and to comply with the law, in line with the Protection of Personal Information Act 4 of 2013. The Customer may ask to see or correct their information at any time." },
    { title: "Change of details", text: "The Customer must inform H&M in writing within 7 days of any change to their address, contact numbers, employer or bank details." },
    { title: "Notices", text: "The Customer chooses the residential address in Part B as the address for delivery of legal notices. H&M may also send notices by email or SMS to the details in Part B." },
    { title: "Certificate of balance", text: "A certificate signed by a manager of H&M stating the amount owing is sufficient proof of that amount unless the Customer proves otherwise." },
    { title: "Whole agreement and changes", text: "This document is the whole agreement between the parties. No change is valid unless it is in writing and signed by both parties. If any clause is found to be invalid, the rest of the agreement remains in force." },
    { title: "Electronic signatures", text: "The parties agree that this agreement may be signed electronically in terms of the Electronic Communications and Transactions Act 25 of 2002, and that an electronic signature or a signed printed copy has the same force as an original signature. H&M keeps a record of the date, time and device information of each electronic signature." },
    { title: "Governing law", text: "This agreement is governed by the laws of the Republic of South Africa. Complaints should first be directed to H&M; unresolved complaints may be referred to the National Credit Regulator or the National Consumer Tribunal." },
  ];
}

export const DECLARATIONS = [
  "I have read and understood this agreement, including the terms and conditions, and they were explained to me in a language I understand.",
  "The principal amount, interest, fees, instalments and total amount repayable were disclosed to me before I signed.",
  "The information I have given in this agreement is true and complete.",
  "I can afford the instalments after my living expenses and other debt obligations.",
  "I am not under debt review, sequestration or administration.",
  "I consent to H&M processing my personal information and reporting to credit bureaux as set out in clauses 11 and 14.",
  "I accept the terms of this agreement and agree to be bound by them.",
];
