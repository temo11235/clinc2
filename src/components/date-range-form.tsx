"use client";

import { Button, Input } from "@/components/ui";

export function DateRangeForm({ from, to, basePath }: { from: string; to: string; basePath: string }) {
  return (
    <form action={basePath} method="get" className="no-print flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">
        من
        <Input type="date" name="from" defaultValue={from} className="mt-1" />
      </label>
      <label className="text-xs text-slate-500">
        إلى
        <Input type="date" name="to" defaultValue={to} className="mt-1" />
      </label>
      <Button type="submit" variant="secondary">
        تطبيق
      </Button>
    </form>
  );
}
