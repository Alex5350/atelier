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
import { Sparkles, Square, RotateCcw, Send, Paperclip, FileText, X } from "lucide-react";
import type { ChatModelChoice } from "@/lib/models/registry";

type PendingFile = {
  id: string;
  filename: string;
  mime: string;
  kind: "image" | "document";
  bytes: number;
  url: string;
  mode: "context" | "retrieval";
  chunks?: number;
};

type CitationSource = {
  fileId: string;
  filename: string;
  ord: number;
  via: string[];
  snippet: string;
};

type ChatMetadata = {
  modelId?: string;
  demo?: boolean;
  conversationId?: string;
  sources?: CitationSource[];
};

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

  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<PendingFile[]>([]);

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

  function humanBytes(count: number): string {
    if (count < 1024) {
      return count + " B";
    }
    if (count < 1024 * 1024) {
      return Math.round(count / 1024) + " KB";
    }
    return (count / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setPending(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/files", { method: "POST", body: form });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          window.alert(detail?.error ? `Upload failed: ${detail.error}` : "Upload failed");
          continue;
        }
        const uploaded = (await response.json()) as PendingFile;
        setUploads((current) => [...current, uploaded]);
      }
    } finally {
      setPending(false);
    }
  }

  async function submit(value: string) {
    const text = value.trim();
    if ((text.length === 0 && uploads.length === 0) || status !== "ready") {
      return;
    }
    // Attachments ride the message as file parts: images for the model to see,
    // documents as reference chips in history (their text is injected
    // server-side as context).
    const fileParts = uploads.map((file) => ({
      type: "file" as const,
      mediaType: file.mime,
      filename: file.filename,
      url: file.url,
    }));
    const parts: Array<{ type: "text"; text: string } | (typeof fileParts)[number]> = [...fileParts];
    if (text.length > 0) {
      parts.push({ type: "text", text });
    }
    const attachments = uploads.map((file) => ({ id: file.id, mode: file.mode }));
    setUploads([]);
    await sendMessage({ parts }, { ...sendOptions(), body: { ...sendOptions().body, attachments } });
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
                {message.role === "assistant" &&
                (message.metadata as ChatMetadata | undefined)?.sources?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(message.metadata as ChatMetadata).sources!.map((source) => (
                      <span
                        key={`${source.fileId}-${source.ord}`}
                        className="flex max-w-72 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                        title={source.snippet}
                      >
                        <FileText className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">
                          {source.filename} c{source.ord}
                        </span>
                        <span className="shrink-0 text-primary/80">
                          {source.via.join("+") || "rank"}
                        </span>
                      </span>
                    ))}
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
                    ) : part.type === "file" ? (
                      part.mediaType.startsWith("image/") ? (
                        <a key={index} href={part.url} target="_blank" rel="noreferrer" className="mt-1.5 block">
                          {/* Authenticated user blobs; next/image optimization does not apply. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={part.url}
                            alt={part.filename ?? "attached image"}
                            className="max-h-56 rounded-lg ring-1 ring-border/60"
                          />
                        </a>
                      ) : (
                        <a
                          key={index}
                          href={part.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-accent"
                        >
                          <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                          {part.filename ?? "attachment"}
                        </a>
                      )
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
        {uploads.length > 0 ? (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
            {uploads.map((file) => (
              <span
                key={file.id}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 py-1 pl-2 pr-1 text-xs"
              >
                {file.kind === "image" ? (
                  // Authenticated user blobs; next/image optimization does not apply.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt="" className="size-4 rounded-sm object-cover" />
                ) : (
                  <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                )}
                <span className="max-w-40 truncate">{file.filename}</span>
                <span className="text-muted-foreground">{humanBytes(file.bytes)}</span>
                {file.kind === "document" ? (
                  <button
                    type="button"
                    title={file.chunks ? "Toggle how this file is used" : "Not indexed; context only"}
                    className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                      file.mode === "retrieval" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                    disabled={!file.chunks}
                    onClick={() =>
                      setUploads((current) =>
                        current.map((f) =>
                          f.id === file.id
                            ? { ...f, mode: f.mode === "context" ? "retrieval" : "context" }
                            : f,
                        ),
                      )
                    }
                  >
                    {file.mode === "retrieval" ? "retrieve" : "context"}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${file.filename}`}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setUploads((current) => current.filter((f) => f.id !== file.id))}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl items-start gap-2">
          <label
            className={pending ? "pointer-events-none opacity-50" : ""}
            title="Attach images or documents"
          >
            <input
              type="file"
              multiple
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,text/csv,application/pdf"
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
              }}
            />
            <span className="flex size-10 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent">
              <Paperclip className="size-4" aria-hidden />
            </span>
          </label>
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
