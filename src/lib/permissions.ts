export type AppRole = "super_admin" | "admin" | "supervisor" | "credit_officer" | "finance_officer";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Administrator",
  admin: "Administrator",
  supervisor: "Supervisor",
  credit_officer: "Credit Officer",
  finance_officer: "Finance Officer",
};

export const ALL_ROLES: AppRole[] = ["super_admin", "admin", "supervisor", "credit_officer", "finance_officer"];

export type Capability =
  | "customers.edit"
  | "idnumber.view"
  | "credit.view"
  | "credit.assess"
  | "loans.create"
  | "loans.manage"
  | "repayments.record"
  | "repayments.reverse"
  | "audit.view"
  | "allowance.manage"
  | "staff.manage";

const ADMIN: AppRole[] = ["super_admin", "admin"];
const MANAGE: AppRole[] = [...ADMIN, "supervisor"];
const CREDIT: AppRole[] = [...MANAGE, "credit_officer"];
const FINANCE: AppRole[] = [...MANAGE, "finance_officer"];

/** Mirrors the database helpers is_admin / can_manage / can_credit / can_finance. */
const MATRIX: Record<Capability, AppRole[]> = {
  "customers.edit": CREDIT,
  "idnumber.view": CREDIT,
  "credit.view": CREDIT,
  "credit.assess": CREDIT,
  "loans.create": CREDIT,
  "loans.manage": MANAGE,
  "repayments.record": FINANCE,
  "repayments.reverse": MANAGE,
  "audit.view": MANAGE,
  "allowance.manage": ADMIN,
  "staff.manage": ADMIN,
};

export function can(role: AppRole | null | undefined, cap: Capability): boolean {
  return !!role && MATRIX[cap].includes(role);
}

/** Roles a staff member may assign to others. */
export function assignableRoles(role: AppRole | null | undefined): AppRole[] {
  if (role === "super_admin") return ALL_ROLES;
  if (role === "admin") return ["supervisor", "credit_officer", "finance_officer"];
  return [];
}

/** Whether `caller` may give `target` role to someone, or manage an account that holds it. */
export function canAssignRole(caller: AppRole | null | undefined, target: AppRole): boolean {
  return assignableRoles(caller).includes(target);
}
