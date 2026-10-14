"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Library,
  MessageSquareText,
  Send,
  SquarePen,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { useEffectsPreference } from "@/components/motion";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";

export interface AskCitation {
  n: number;
  title: string;
  source: string;
  url?: string;
}

export interface AskMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AskCitation[];
}

export interface AskSession {
  id: string;
  label: string;
  createdAt: string;
}

/** Starter questions shown in the empty state. */
const SUGGESTIONS = [
  "What are the biggest themes in what I've saved?",
  "Summarize the key findings from my uploaded papers.",
  "What do my sources say about AI regulation?",
];

function Citations({ citations }: { citations: AskCitation[] }) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-[11px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
        Sources
      </span>
      {citations.map((citation) => {
        const isDocument = citation.url === "/research";
        const inner = (
          <>
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-medium text-brand">
              {citation.n}
            </span>
            <span className="leading-snug">
              <span className="text-foreground">{citation.title}</span>{" "}
              <span className="text-muted-foreground">— {citation.source}</span>
            </span>
          </>
        );
        return citation.url ? (
          <Link
            key={`${citation.n}-${citation.title}`}
            href={citation.url}
            {...(isDocument
              ? {}
              : { target: "_blank", rel: "noopener noreferrer" })}
            className="flex items-start gap-2 text-sm hover:text-foreground"
          >
            {inner}
            {isDocument ? null : (
              <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden="true" />
            )}
          </Link>
        ) : (
          <div key={`${citation.n}-${citation.title}`} className="flex items-start gap-2 text-sm">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Three ink droplets that swell while the answer is being generated.
 * The dots stay still under reduced motion — the sr-only "Thinking…" text
 * carries the state either way, so nothing depends on the animation.
 */
function InkOrb() {
  const { reduceEffects } = useEffectsPreference();
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="bg-brand/70 block size-2 rounded-full"
          animate={
            reduceEffects
              ? { opacity: 0.6 }
              : { scale: [0.7, 1, 0.7], opacity: [0.4, 1, 0.4] }
          }
          transition={
            reduceEffects
              ? { duration: 0 }
              : {
                  duration: 1.1,
                  repeat: Infinity,
                  delay: index * 0.16,
                  ease: "easeInOut",
                }
          }
        />
      ))}
    </span>
  );
}

/** Message wrapper: a short rise on arrival, skipped under reduced motion. */
function MessageShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { reduceEffects } = useEffectsPreference();
  if (reduceEffects) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function AskView({
  sessions,
  activeSessionId,
  initialMessages,
  hasLibrary,
}: {
  sessions: AskSession[];
  activeSessionId: string | null;
  initialMessages: AskMessage[];
  hasLibrary: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<AskMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(activeSessionId);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [messages, thinking]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;

    setMessages((previous) => [
      ...previous,
      { id: `u-${Date.now()}`, role: "user", content: question },
    ]);
    setInput("");
    setThinking(true);
    setError(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          session_id: sessionId ?? undefined,
        }),
      });
      const data = (await response.json()) as {
        session_id?: string;
        answer?: string;
        citations?: AskCitation[];
        error?: string;
      };
      if (!response.ok || !data.answer) {
        throw new Error(data.error ?? "Could not answer — try again.");
      }
      setMessages((previous) => [
        ...previous,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer!,
          citations: data.citations?.length ? data.citations : undefined,
        },
      ]);
      if (!sessionId && data.session_id) {
        setSessionId(data.session_id);
        router.replace(`/ask?session=${data.session_id}`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
      // Keep the user's question visible so it can be retried.
      setInput(question);
    } finally {
      setThinking(false);
    }
  }

  const showEmpty = messages.length === 0 && !thinking;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
            Ask
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers come only from the articles and papers you&rsquo;ve saved.
          </p>
        </div>
        {sessions.length > 0 ? (
          <Button variant="outline" onClick={() => router.push("/ask")}>
            <SquarePen aria-hidden="true" />
            New chat
          </Button>
        ) : null}
      </div>

      {sessions.length > 1 ? (
        <nav
          className="flex gap-2 overflow-x-auto border-b border-border/60 py-2"
          aria-label="Your chats"
        >
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/ask?session=${session.id}`}
              className={cn(
                "max-w-56 truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                session.id === sessionId
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {session.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div
        ref={scrollRef}
        className="flex flex-col gap-4 overflow-y-auto py-6"
        style={{ maxHeight: "calc(100vh - 24rem)" }}
        aria-live="polite"
      >
        {showEmpty ? (
          <EmptyState
            icon={hasLibrary ? MessageSquareText : Library}
            title={hasLibrary ? "Ask your library anything" : "Save something first"}
            description={
              hasLibrary
                ? "Questions run over the articles and papers you've saved, with citations back to the source. Try one of these:"
                : "Ask works over what you save. Save articles on Today or upload a paper in Research, then ask about them here."
            }
            action={
              hasLibrary ? (
                <div className="flex max-w-md flex-col gap-2 pt-1">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-lg border border-border bg-background px-4 py-2 text-left text-sm transition-colors hover:border-brand/50 hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Link href="/today">
                    <Button>Browse Today</Button>
                  </Link>
                  <Link href="/research">
                    <Button variant="outline">Upload a paper</Button>
                  </Link>
                </div>
              )
            }
          />
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <MessageShell key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {message.content}
                </p>
              </MessageShell>
            ) : (
              <MessageShell
                key={message.id}
                className="max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5 text-sm leading-relaxed"
              >
                <p>{message.content}</p>
                {message.citations?.length ? (
                  <Citations citations={message.citations} />
                ) : null}
              </MessageShell>
            ),
          )
        )}

        {thinking ? (
          <div
            className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5"
            role="status"
          >
            <InkOrb />
            <span className="sr-only">Thinking…</span>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2 rounded-xl border border-border bg-card p-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder={
            hasLibrary
              ? "Ask about what you've saved…"
              : "Save an article first, then ask about it…"
          }
          aria-label="Your question"
          className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={thinking || !input.trim()}
          className={cn(
            "shrink-0",
            input.trim() && "bg-brand text-brand-foreground hover:bg-brand/90",
          )}
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}
