"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Tag } from "lucide-react";
import { addPriceRow, createModel } from "@/app/(app)/admin/actions";

/**
 * The registry editor: a new model is three fields and a provider pick; a new
 * price is an effective-dated append, never an edit of history.
 */
export function AddModelForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [modality, setModality] = useState("text");
  const [modelName, setModelName] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending || id.trim().length === 0) {
      return;
    }
    setPending(true);
    try {
      await createModel({
        id,
        displayName,
        provider: provider as "openai",
        modality: modality as "text",
        modelName,
        contextWindow: contextWindow.trim().length > 0 ? Number(contextWindow) : null,
      });
      toast.success(`${id} registered; it appears in pickers without a deploy`);
      setOpen(false);
      setId("");
      setDisplayName("");
      setModelName("");
      setContextWindow("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the model");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden /> Add model
      </Button>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-3">
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Registry id (provider/name)</Label>
        <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="openai/gpt-5.6-mini" className="h-9" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Display name</Label>
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="GPT-5.6 Mini" className="h-9" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <Select value={provider} onValueChange={(value) => value && setProvider(value)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["anthropic", "openai", "google", "mock"].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Modality</Label>
        <Select value={modality} onValueChange={(value) => value && setModality(value)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["text", "image", "video", "embedding"].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Provider model name</Label>
        <Input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="gpt-5.6-mini" className="h-9" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Context window</Label>
        <Input value={contextWindow} onChange={(event) => setContextWindow(event.target.value.replace(/[^0-9]/g, ""))} placeholder="200000" className="h-9" inputMode="numeric" />
      </div>
      <div className="sm:col-span-3 flex gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={pending || id.trim().length === 0}>
          Register
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AddPriceForm({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inputPerMtok, setInput] = useState("");
  const [outputPerMtok, setOutput] = useState("");
  const [perImage, setPerImage] = useState("");
  const [perVideoSecond, setPerSecond] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      await addPriceRow({
        modelId,
        inputPerMtok: inputPerMtok.trim() ? Number(inputPerMtok) : null,
        outputPerMtok: outputPerMtok.trim() ? Number(outputPerMtok) : null,
        perImage: perImage.trim() ? Number(perImage) : null,
        perVideoSecond: perVideoSecond.trim() ? Number(perVideoSecond) : null,
      });
      toast.success(`New price effective now for ${modelId}`);
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Add an effective-dated price row"
        onClick={() => setOpen(true)}
      >
        <Tag className="size-3" aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2" onClick={(event) => event.stopPropagation()}>
      {[
        { label: "$/Mtok in", value: inputPerMtok, set: setInput },
        { label: "$/Mtok out", value: outputPerMtok, set: setOutput },
        { label: "$/image", value: perImage, set: setPerImage },
        { label: "$/sec", value: perVideoSecond, set: setPerSecond },
      ].map((field) => (
        <div key={field.label} className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
          <Input
            value={field.value}
            onChange={(event) => field.set(event.target.value.replace(/[^0-9.]/g, ""))}
            className="h-8 w-20 text-xs"
            inputMode="decimal"
          />
        </div>
      ))}
      <Button size="sm" className="h-8" onClick={() => void submit()} disabled={pending}>
        Set
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
