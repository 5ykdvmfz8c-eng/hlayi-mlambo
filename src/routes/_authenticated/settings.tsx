import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — H&M Credit Portal" }] }),
  component: () => (
    <>
      <PageHeader title="Settings" subtitle="Update your profile and password." />
      <Panel><EmptyState icon={Construction} title="This section is coming next" text="Update your profile and password." /></Panel>
    </>
  ),
});
