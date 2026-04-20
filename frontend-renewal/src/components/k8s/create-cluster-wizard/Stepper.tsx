"use client";

import { cx } from "@/lib/utils";

interface StepperProps {
  labels: readonly string[];
  currentIndex: number;
  maxReachedIndex: number;
  onSelect: (index: number) => void;
}

export function Stepper({ labels, currentIndex, maxReachedIndex, onSelect }: StepperProps) {
  return (
    <nav aria-label="Wizard steps" className="flex flex-col gap-4">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Step <span className="font-semibold text-gray-900 dark:text-gray-50">{currentIndex + 1}</span>{" "}
        of <span className="font-semibold text-gray-900 dark:text-gray-50">{labels.length}</span>{" "}
        <span className="mx-1">—</span>
        <span className="font-medium text-gray-900 dark:text-gray-50">{labels[currentIndex]}</span>
      </div>
      <ol className="flex flex-wrap items-center gap-2">
        {labels.map((label, i) => {
          const isCurrent = i === currentIndex;
          const isReachable = i <= maxReachedIndex;
          const isDone = i < currentIndex;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-label={`Step ${i + 1}: ${label}`}
                disabled={!isReachable}
                onClick={() => isReachable && onSelect(i)}
                className={cx(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isCurrent
                    ? "bg-indigo-600 text-white"
                    : isDone
                      ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300"
                      : isReachable
                        ? "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                        : "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-600 cursor-not-allowed",
                )}
              >
                <span
                  className={cx(
                    "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                    isCurrent
                      ? "bg-white/20"
                      : isDone
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
                  )}
                >
                  {i + 1}
                </span>
                {label}
              </button>
              {i < labels.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-gray-200 dark:bg-gray-800" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
