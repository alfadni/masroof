import { createFileRoute } from "@tanstack/react-router";
import { MasroofApp } from "@/components/masroof/app";

export const Route = createFileRoute("/")({
  ssr: false,
  component: MasroofApp,
});
