"use client";

import * as React from "react";
import { MessageSquareText, Send, SquarePen } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import {
  askSuggestions,
  cannedReplies,
  initialMessages,
  type ChatMessage,
} from "@/lib/mock-data";

function Citations({ citations }: { citations: NonNullable<ChatMessage["citations"]> }) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-[11px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
        Sources
      </span>
      {citations.map((citation) => (
        <div key={citation.n} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-medium text-brand">
            {citation.n}
          </span>
          <span className="leading-snug">
            <span className="text-foreground">{citation.title}</span>{" "}
            <span className="text-muted-foreground">— {citation.source}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function AskView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [replyIndex, setReplyIndex] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [messages, thinking]);

  React.useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
    },
    [],
  );

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMessage: ChatMessage = {
      id: `u-${messages.length}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setThinking(true);

    const timer = window.setTimeout(() => {
      const reply = cannedReplies[replyIndex % cannedReplies.length];
      setReplyIndex((index) => index + 1);
      setMessages((prev) => [...prev, { ...reply, id: `a-${prev.length}` }]);
      setThinking(false);
    }, 900);
    timersRef.current.push(timer);
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setThinking(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">Ask</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers come only from the articles and papers you&rsquo;ve saved.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={newChat}
          disabled={messages.length === 0 && !thinking}
        >
          <SquarePen aria-hidden="true" />
          New chat
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col gap-4 overflow-y-auto py-6"
        style={{ maxHeight: "calc(100vh - 24rem)" }}
        aria-live="polite"
      >
        {messages.length === 0 && !thinking ? (
          <EmptyState
            icon={MessageSquareText}
            title="Ask your library anything"
            description="Questions run over the articles and papers you've saved, with citations back to the source. Try one of these:"
            action={
              <div className="flex max-w-md flex-col gap-2 pt-1">
                {askSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-brand/50 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            }
          />
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {message.content}
                </p>
              </div>
            ) : (
              <div
                key={message.id}
                className="max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5 text-sm leading-relaxed"
              >
                <p>{message.content}</p>
                {message.citations?.length ? (
                  <Citations citations={message.citations} />
                ) : null}
              </div>
            ),
          )
        )}

        {thinking ? (
          <div
            className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5"
            role="status"
          >
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="size-2 rounded-full" />
            <span className="sr-only">Thinking…</span>
          </div>
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
          placeholder="Ask about what you've saved…"
          aria-label="Your question"
          className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={thinking || !input.trim()}
          className={cn("shrink-0", input.trim() && "bg-brand text-brand-foreground hover:bg-brand/90")}
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
