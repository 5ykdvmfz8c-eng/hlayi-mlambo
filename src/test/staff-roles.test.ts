import { describe, expect, it } from "vitest";
import { assignableRoles, canAssignRole, can } from "@/lib/permissions";

describe("staff role rules", () => {
  it("a Super Administrator can assign every role", () => {
    expect(assignableRoles("super_admin")).toEqual(["super_admin", "admin", "supervisor", "credit_officer", "finance_officer"]);
  });
  it("an Administrator cannot create or manage administrators", () => {
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
  });
  it("an Administrator can assign supervisor, credit and finance roles", () => {
    expect(assignableRoles("admin")).toEqual(["supervisor", "credit_officer", "finance_officer"]);
  });
  it("supervisors and officers cannot assign roles", () => {
    expect(assignableRoles("supervisor")).toEqual([]);
    expect(assignableRoles("credit_officer")).toEqual([]);
  });
  it("only administrators may open staff management", () => {
    expect(can("admin", "staff.manage")).toBe(true);
    expect(can("supervisor", "staff.manage")).toBe(false);
  });
});
