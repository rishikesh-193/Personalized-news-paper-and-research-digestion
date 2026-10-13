import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AskView,
  type AskMessage,
  type AskSession,
} from "@/components/views/ask-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask" };

interface MessageRow {
  id: string;
  role: string;
  content: string;
  citations: unknown;
}

/**
 * Chat over the user's own library. Sessions and messages live in
 * `chat_sessions` / `chat_messages` under RLS; answers come from the
 * /api/ask retrieval pipeline, never canned replies.
 */
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { session: sessionParam } = await searchParams;

  const sessionsResult = await supabase
    .from("chat_sessions")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (sessionsResult.error) throw new Error("Could not load your chats");

  const sessions: AskSession[] = (sessionsResult.data ?? []).map((row) => ({
    id: String(row.id),
    label: "Chat",
    createdAt: row.created_at ? String(row.created_at) : "",
  }));

  const activeSessionId =
    sessionParam && sessions.some((session) => session.id === sessionParam)
      ? sessionParam
      : (sessions[0]?.id ?? null);

  let messages: AskMessage[] = [];
  if (activeSessionId) {
    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, citations")
      .eq("user_id", userId)
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error("Could not load this chat");
    messages = (rows ?? []).map((row: MessageRow) => ({
      id: String(row.id),
      role: row.role === "user" ? "user" : "assistant",
      content: String(row.content),
      citations:
        Array.isArray(row.citations) && row.citations.length > 0
          ? (row.citations as AskMessage["citations"])
          : undefined,
    }));

    // Label each session by its first question (client renders it).
    const firstUser = messages.find((message) => message.role === "user");
    const active = sessions.find((session) => session.id === activeSessionId);
    if (active && firstUser) {
      active.label =
        firstUser.content.length > 48
          ? `${firstUser.content.slice(0, 48)}…`
          : firstUser.content;
    }
  }

  const { count } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return (
    <AskView
      key={activeSessionId ?? "new"}
      sessions={sessions}
      activeSessionId={activeSessionId}
      initialMessages={messages}
      hasLibrary={(count ?? 0) > 0}
    />
  );
}
