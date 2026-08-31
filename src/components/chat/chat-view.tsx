"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Square, RotateCcw, Send } from "lucide-react";
import type { ChatModelChoice } from "@/lib/models/registry";

type ChatMetadata = { modelId?: string; demo?: boolean; conversationId?: string };

export function ChatView({
  conversationId,
  initialMessages,
  models,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  models: ChatModelChoice[];
}) {
  const defaultModel = models[0]?.id ?? "mock/atelier-muse";
  const [modelId, setModelId] = useState(defaultModel);
  // Starts empty for brand-new chats; the server assigns the real id on the
  // first turn and it rides back on message metadata.
  const conversationRef = useRef(conversationId === "pending" ? "" : conversationId);

  const { messages, sendMessage, status, stop, regenerate, error, setMessages } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // The per-turn body is attached at send time (event handlers), never through
  // a render-reachable closure: it reflects the live model choice and the
  // adopted conversation id.
  function sendOptions() {
    return {
      body: {
        conversationId: conversationRef.current || "pending",
        modelId,
      },
    };
  }

  // Adopt the server-assigned conversation id: remember it for later turns
  // and replace the URL so the conversation is addressable without reloading.
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i].metadata as ChatMetadata | undefined;
      const id = meta?.conversationId;
      if (id) {
        if (conversationRef.current !== id) {
          conversationRef.current = id;
          window.history.replaceState(null, "", `/chat/${id}`);
        }
        break;
      }
    }
  }, [messages]);

  const modelById = useMemo(
    () => new Map(models.map((model) => [model.id, model])),
    [models],
  );

  async function submit(value: string) {
    const text = value.trim();
    if (text.length === 0 || status !== "ready") {
      return;
    }
    await sendMessage({ text }, sendOptions());
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      <ScrollArea className="flex-1 pr-3">
        <div className="mx-auto max-w-3xl space-y-6 pb-6">
          {messages.length === 0 ? (
            <div className="pt-16 text-center text-sm text-muted-foreground">
              Ask anything. The selected model streams its answer here, and the conversation is
              saved as it happens.
            </div>
          ) : null}
          {messages.map((message) => {
            const meta = (message.metadata ?? {}) as ChatMetadata;
            const model = meta.modelId ? modelById.get(meta.modelId) : undefined;
            return (
              <div
                key={message.id}
                className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
              >
                {message.role === "assistant" && model ? (
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{model.displayName}</span>
                    {model.isMock ? (
                      <Badge variant="outline" className="h-4 border-primary/40 bg-primary/10 px-1.5 text-[10px] text-primary">
                        DEMO
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-2.5 text-sm ring-1 ring-primary/20"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-sm ring-1 ring-border/60"
                  }
                >
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <div key={index} className="prose-invert break-words leading-relaxed [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
          {status === "submitted" || status === "streaming" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {modelById.get(modelId)?.displayName ?? "the model"} is composing...
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="mt-3 border-t border-border/60 pt-3">
        <div className="mx-auto flex max-w-3xl items-start gap-2">
          <Select
            value={modelId}
            onValueChange={(value) => {
              if (value) {
                setModelId(value);
              }
            }}
          >
            <SelectTrigger className="w-52 shrink-0" aria-label="Model for this conversation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <span className="flex items-center gap-2">
                    {model.isMock ? <Sparkles className="size-3.5 text-primary" aria-hidden /> : null}
                    {model.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Message the studio..."
            className="min-h-11 resize-none"
            rows={2}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const target = event.currentTarget;
                void submit(target.value).then(() => {
                  target.value = "";
                });
              }
            }}
          />
          {status === "ready" ? (
            <Button
              size="icon"
              className="size-10 shrink-0"
              aria-label="Send"
              onClick={(event) => {
                const textarea = event.currentTarget.parentElement?.querySelector("textarea");
                if (textarea instanceof HTMLTextAreaElement) {
                  void submit(textarea.value).then(() => {
                    textarea.value = "";
                  });
                }
              }}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button size="icon" className="size-10 shrink-0" aria-label="Stop" variant="outline" onClick={() => stop()}>
              <Square className="size-4" aria-hidden />
            </Button>
          )}
          <Button
            size="icon"
            className="size-10 shrink-0"
            variant="ghost"
            aria-label="Regenerate last reply"
            disabled={status !== "ready" || messages.at(-1)?.role !== "assistant"}
            onClick={() => {
              // Drop the trailing assistant turn locally and regenerate from
              // history; the server persists the fresh reply on completion.
              const last = messages.at(-1);
              if (last?.role === "assistant") {
                setMessages(messages.slice(0, -1));
              }
              void regenerate(sendOptions());
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
