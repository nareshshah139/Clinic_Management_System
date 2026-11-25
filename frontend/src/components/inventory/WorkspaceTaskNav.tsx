"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TaskGroup = { label: string; tasks: [view: string, label: string][] };

/**
 * @cc [owner:nareshshah139,label:accessibility] inventory-task-list
 * Every task in an area MUST be a named button in a visible list grouped by purpose. On phones the
 * same list opens from one control that names the current task; choosing a task or pressing Escape
 * closes it, and Escape returns focus to that control.
 */
export function WorkspaceTaskNav({
  label,
  groups,
  current,
  taskLabel,
  onSelect,
}: {
  label: string;
  groups: TaskGroup[];
  current: string;
  taskLabel: (view: string, label: string) => string;
  onSelect: (view: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const currentTask = groups.flatMap((group) => group.tasks).find(([view]) => view === current);
  return (
    <nav aria-label={label} className="print:hidden">
      <Button
        ref={toggle}
        type="button"
        variant="outline"
        className="w-full justify-between md:hidden"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 truncate">Task: {currentTask ? taskLabel(...currentTask) : "choose one"}</span>
        <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <div
        id={listId}
        className={cn("gap-x-6 gap-y-2 md:flex md:flex-wrap", open ? "mt-3 grid" : "max-md:hidden")}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          setOpen(false);
          toggle.current?.focus();
        }}
      >
        {groups.map((group, index) => (
          <div key={group.label} role="group" aria-labelledby={groups.length > 1 ? `${listId}-${index}` : undefined} className="min-w-0">
            {groups.length > 1 && <p id={`${listId}-${index}`} className="px-1 text-xs font-medium text-muted-foreground">{group.label}</p>}
            <ul className="flex flex-wrap gap-1">
              {group.tasks.map(([view, name]) => (
                <li key={view}>
                  <Button
                    size="sm"
                    variant={view === current ? "secondary" : "ghost"}
                    aria-current={view === current ? "page" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onSelect(view);
                    }}
                  >
                    {taskLabel(view, name)}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
