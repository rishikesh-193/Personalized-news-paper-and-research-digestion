import type { Metadata } from "next";
import { ResearchView } from "@/components/views/research-view";
import { isTavilyConfigured } from "@/lib/discovery/tavily";

export const metadata: Metadata = { title: "Research" };

export default function ResearchPage() {
  // The server alone can see TAVILY_API_KEY, so it decides whether the
  // Discover tab offers web modes.
  return <ResearchView webEnabled={isTavilyConfigured()} />;
}
