import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports & analytics — H&M Credit Portal" }] }),
  component: () => (
    <>
      <PageHeader title="Reports & analytics" subtitle="Daily, weekly and monthly reports with PDF and Excel export." />
      <Panel><EmptyState icon={Construction} title="This section is coming next" text="Daily, weekly and monthly reports with PDF and Excel export." /></Panel>
    </>
  ),
});
