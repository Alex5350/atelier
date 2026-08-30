import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* ambient gradient field: warm lamplight on the studio's dark canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, oklch(0.78 0.14 65 / 0.14), transparent 60%)," +
            "radial-gradient(50rem 35rem at 110% 15%, oklch(0.66 0.1 55 / 0.10), transparent 55%)," +
            "radial-gradient(70rem 50rem at 50% 120%, oklch(0.45 0.06 40 / 0.14), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm px-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
