"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { createProject } from "@/lib/studio/queries";

export async function newProject(formData: FormData) {
  const session = await requireSession();
  const title = String(formData.get("title") ?? "").trim();
  const id = await createProject(session.user.id, title || "Untitled project");
  redirect(`/studio/${id}`);
}
