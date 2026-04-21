"use client";

import { Card } from "@/components/Card";
import { cx } from "@/lib/utils";
import type { K8sTemplateSummary } from "@/lib/types/k8s";
import type { CreationMode } from "./types";

interface StepCreationModeProps {
  mode: CreationMode;
  onModeChange: (mode: CreationMode) => void;
  templates: K8sTemplateSummary[];
  templateLoading: boolean;
  selectedTemplateName: string | null;
  onSelectTemplate: (name: string) => void;
}

export function StepCreationMode({
  mode,
  onModeChange,
  templates,
  templateLoading,
  selectedTemplateName,
  onSelectTemplate,
}: StepCreationModeProps) {
  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Creation Mode</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          How would you like to create your cluster?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeCard
          selected={mode === "scratch"}
          onClick={() => onModeChange("scratch")}
          title="Start from Scratch"
          subtitle="Configure every setting manually"
          icon="pencil"
        />
        <ModeCard
          selected={mode === "template"}
          onClick={() => onModeChange("template")}
          title="Start from Template"
          subtitle="Pre-fill settings from a template"
          icon="doc"
        />
      </div>

      {mode === "template" && (
        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Choose template</h3>
          {templateLoading ? (
            <p className="text-sm text-gray-500">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-500">
              No AerospikeClusterTemplate found in the cluster. Create one first, or switch to
              &ldquo;Start from Scratch&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onSelectTemplate(t.name)}
                  className={cx(
                    "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selectedTemplateName === t.name
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-200"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
                  )}
                >
                  <span className="font-medium text-gray-900 dark:text-gray-50">{t.name}</span>
                  {t.description && (
                    <span className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {t.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  subtitle,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: "pencil" | "doc";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex flex-col items-center gap-2 rounded-lg border px-4 py-6 text-center transition-colors",
        selected
          ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex size-10 items-center justify-center rounded-full",
          selected
            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
        )}
      >
        {icon === "pencil" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </span>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
    </button>
  );
}
