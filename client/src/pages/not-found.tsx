import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <p className="text-4xl font-bold text-border">404</p>
      <p className="text-sm">Page not found</p>
      <Link href="/">
        <a className="text-xs text-primary hover:underline">← Back to Overview</a>
      </Link>
    </div>
  );
}
