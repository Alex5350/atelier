import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listProjects } from "@/lib/studio/queries";
import { newProject } from "./actions";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Images, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioPage() {
  const session = await requireSession();
  const projects = await listProjects(session.user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Studio</h1>
        </MotionItem>
        <MotionItem>
          <p className="text-sm text-muted-foreground">
            Projects of passes: prompt, reference, generate. Outputs become assets that later
            passes build on, and every run lands in the cost ledger.
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionItem>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading">
              <Plus className="size-4 text-primary" aria-hidden /> New project
            </CardTitle>
            <CardDescription>A project is a timeline of passes with a shared asset pool.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={newProject} className="flex gap-2">
              <Input name="title" placeholder="Copper series, brand refresh, ..." className="max-w-sm" />
              <Button type="submit" variant="outline">Create</Button>
            </form>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <MotionItem key={project.id}>
            <Link href={`/studio/${project.id}`} className="block h-full">
              <Card className="h-full border-border/60 bg-card/60 transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-heading text-base">
                    <Images className="size-4 text-primary" aria-hidden />
                    <span className="truncate">{project.title}</span>
                  </CardTitle>
                  <CardDescription>
                    {project.passCount} {project.passCount === 1 ? "pass" : "passes"} ·{" "}
                    {project.assetCount} {project.assetCount === 1 ? "asset" : "assets"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  updated {project.updatedAt.toLocaleDateString()}
                </CardContent>
              </Card>
            </Link>
          </MotionItem>
        ))}
        {projects.length === 0 ? (
          <MotionItem className="col-span-full">
            <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
              No projects yet. Name one above and make the first pass.
            </div>
          </MotionItem>
        ) : null}
      </MotionStagger>
    </div>
  );
}
