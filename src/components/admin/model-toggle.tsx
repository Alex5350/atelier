"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleModelEnabled } from "@/app/(app)/admin/actions";

export function ModelToggle({ modelId, enabled }: { modelId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={enabled}
      disabled={pending}
      aria-label={`${enabled ? "Disable" : "Enable"} ${modelId}`}
      onCheckedChange={(next) => {
        startTransition(async () => {
          await toggleModelEnabled(modelId, next);
        });
      }}
    />
  );
}
