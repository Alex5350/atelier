import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The app's honest 404: what was sought is not here, and where to go next. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle>Nothing here</CardTitle>
          <CardDescription>
            The page you asked for does not exist. It may have been a conversation or
            project that was removed, or a link that never pointed anywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/" />}>Back to the dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
