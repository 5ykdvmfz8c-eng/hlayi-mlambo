import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/credit-allowance")({
  head: () => ({ meta: [{ title: "Daily credit allowance — H&M Credit Portal" }] }),
  component: () => (
    <>
      <PageHeader title="Daily credit allowance" subtitle="Set default and per-staff daily credit limits and view usage history." />
      <Panel><EmptyState icon={Construction} title="This section is coming next" text="Set default and per-staff daily credit limits and view usage history." /></Panel>
    </>
  ),
});
