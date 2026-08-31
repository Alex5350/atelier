import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { listModelViews } from "@/lib/models/queries";
import { ModelToggle } from "@/components/admin/model-toggle";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KeyRound, PlugZap, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Admin" };

const PROVIDER_CLASS: Record<string, string> = {
  anthropic: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  openai: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  google: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  mock: "border-primary/40 bg-primary/10 text-primary",
};

export default async function AdminPage() {
  await requireSession();
  const models = await listModelViews();
  const configured = new Set(
    models.filter((m) => m.status.status === "available" && !m.isMock).map((m) => m.provider),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Model registry</h1>
        </MotionItem>
        <MotionItem>
          <p className="text-sm text-muted-foreground">
            Models are rows, not code: enable what surfaces offer, and the app picks up new rows
            without a deploy. Prices are estimates for the usage ledger, not billing truth.
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionStagger className="grid gap-4 sm:grid-cols-3">
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <PlugZap className="size-3.5" aria-hidden /> Providers configured
              </CardDescription>
              <CardTitle className="font-heading text-2xl tabular-nums">{configured.size} of 3</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Keys live only in the server environment; none are stored in the database or repo.
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Sparkles className="size-3.5" aria-hidden /> Zero-key demo mode
              </CardDescription>
              <CardTitle className="font-heading text-2xl">Always on</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Atelier Muse streams deterministic replies with no keys, labeled DEMO everywhere it
              appears.
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <KeyRound className="size-3.5" aria-hidden /> Missing keys
              </CardDescription>
              <CardTitle className="font-heading text-2xl tabular-nums">
                {models.filter((m) => m.status.status === "needs-key").length} models waiting
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Set the environment variable shown on each row to light a provider up.
            </CardContent>
          </Card>
        </MotionItem>
      </MotionStagger>

      <MotionItem>
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="font-heading">Registered models</CardTitle>
            <CardDescription>{models.length} models across text, image, and embedding modalities.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Modality</TableHead>
                  <TableHead>Est. price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.displayName}</span>
                        <span className="text-xs text-muted-foreground">{model.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PROVIDER_CLASS[model.provider] ?? ""}>
                        {model.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{model.modality}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {model.priceSummary ?? "not priced"}
                    </TableCell>
                    <TableCell>
                      {model.status.status === "available" && model.isMock ? (
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                          DEMO
                        </Badge>
                      ) : model.status.status === "available" ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                          ready
                        </Badge>
                      ) : model.status.status === "needs-key" ? (
                        <span className="text-xs text-muted-foreground" title="Environment variable to set">
                          set {model.status.missingEnvVar}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ModelToggle modelId={model.id} enabled={model.enabled} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </MotionItem>
    </div>
  );
}
