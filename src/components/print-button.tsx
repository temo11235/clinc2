"use client";

import { Button } from "@/components/ui";

export function PrintButton({ label = "🖨 طباعة" }: { label?: string }) {
  return (
    <div className="no-print mb-4">
      <Button type="button" variant="secondary" onClick={() => window.print()}>
        {label}
      </Button>
    </div>
  );
}
