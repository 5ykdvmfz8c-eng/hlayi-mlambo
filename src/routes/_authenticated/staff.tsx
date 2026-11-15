import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff management — H&M Credit Portal" }] }),
  component: () => (
    <>
      <PageHeader title="Staff management" subtitle="Add staff, assign roles, activate or deactivate accounts and reset access." />
      <Panel><EmptyState icon={Construction} title="This section is coming next" text="Add staff, assign roles, activate or deactivate accounts and reset access." /></Panel>
    </>
  ),
});
