import type { Metadata } from "next";
import { TodayView } from "@/components/views/today-view";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayView />;
}
