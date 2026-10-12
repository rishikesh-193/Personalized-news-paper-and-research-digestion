import type { Metadata } from "next";
import { ResearchView } from "@/components/views/research-view";

export const metadata: Metadata = { title: "Research" };

export default function ResearchPage() {
  return <ResearchView />;
}
