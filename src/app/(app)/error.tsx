"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Segment-level error boundary: an unexpected failure in a page keeps the
 * shell intact, states plainly that something broke, and offers the retry
 * that costs the least (re-render the segment) before a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error("atelier page error", error);
  }, [error]);

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader>
        <CardTitle>Something broke on this page</CardTitle>
        <CardDescription>
          The error was logged to the server console. Retrying re-renders just this page;
          your conversations, projects, and assets are untouched.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to the dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
