import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — H&M Credit Portal" }] }),
  component: () => (
    <>
      <PageHeader title="Notifications" subtitle="Alerts for upcoming repayments, overdue accounts, new customers, assessments, loans and payments." />
      <Panel><EmptyState icon={Construction} title="This section is coming next" text="Alerts for upcoming repayments, overdue accounts, new customers, assessments, loans and payments." /></Panel>
    </>
  ),
});
