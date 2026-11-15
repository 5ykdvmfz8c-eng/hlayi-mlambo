import { createFileRoute, redirect } from "@tanstack/react-router";

// The portal is staff-only: the home address sends people to the staff sign-in,
// which forwards signed-in staff to their dashboard.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "H&M Credit Portal — Staff access" },
      { name: "description", content: "Staff access to the H&M Consulting & Tech credit management portal." },
      { property: "og:title", content: "H&M Credit Portal — Staff access" },
      { property: "og:description", content: "Staff access to the H&M Consulting & Tech credit management portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
