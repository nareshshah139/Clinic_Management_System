import { ArrowRight } from "lucide-react";

/**
 * @cc [owner:nareshshah139,label:product] correction-before-after
 * A correction preview MUST show every supplied changed value with its saved value; empty
 * values MUST be labelled explicitly. The preview MUST NOT claim that changes are saved.
 */
export function InventoryChangePreview({
  changes,
}: {
  changes: { label: string; before: string; after: string }[];
}) {
  if (!changes.length)
    return <p className="text-sm text-muted-foreground">No changes yet.</p>;
  return (
    <section
      aria-label="Check your changes"
      className="space-y-2 border-y py-3"
    >
      <h4 className="font-medium">Check your changes</h4>
      <ul className="divide-y text-sm">
        {changes.map((change) => (
          <li
            key={change.label}
            className="grid gap-1 py-2 sm:grid-cols-[1fr_2fr]"
          >
            <span className="text-muted-foreground">{change.label}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span>
                <span className="sr-only">Saved: </span>
                {change.before || "Not entered"}
              </span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              <strong>
                <span className="sr-only">Change to: </span>
                {change.after || "Not entered"}
              </strong>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
