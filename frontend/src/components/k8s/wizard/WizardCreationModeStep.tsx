import Link from "next/link";
import { FileText, PenLine, Loader2 } from "lucide-react";
import { formatTemplateSpecField } from "./template-prefill";
import type { WizardCreationModeStepProps } from "./types";

const PREVIEW_FIELDS = [
  { key: "image", label: "Image" },
  { key: "size", label: "Size" },
  { key: "resources", label: "Resources" },
  { key: "monitoring", label: "Monitoring" },
  { key: "storage", label: "Storage" },
  { key: "networkPolicy", label: "Network" },
  { key: "scheduling", label: "Scheduling" },
] as const;

export function WizardCreationModeStep({
  updateForm,
  templates,
  creationMode,
  setCreationMode,
  selectedTemplateName,
  onTemplateSelect,
  templateDetail,
  templateLoading,
}: WizardCreationModeStepProps) {
  const handleModeChange = (mode: "scratch" | "template") => {
    setCreationMode(mode);
    if (mode === "scratch") {
      updateForm({ templateRef: undefined, templateOverrides: undefined });
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-base-content/60 text-sm">How would you like to create your cluster?</p>

      {/* Mode selection cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleModeChange("scratch")}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 text-center transition-colors ${
            creationMode === "scratch"
              ? "border-accent bg-accent/5"
              : "border-base-300 hover:border-accent/50"
          }`}
        >
          <PenLine
            className={`h-8 w-8 ${creationMode === "scratch" ? "text-accent" : "text-base-content/60"}`}
          />
          <span className="text-sm font-medium">Start from Scratch</span>
          <span className="text-base-content/60 text-xs">Configure every setting manually</span>
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("template")}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 text-center transition-colors ${
            creationMode === "template"
              ? "border-accent bg-accent/5"
              : "border-base-300 hover:border-accent/50"
          }`}
        >
          <FileText
            className={`h-8 w-8 ${creationMode === "template" ? "text-accent" : "text-base-content/60"}`}
          />
          <span className="text-sm font-medium">Start from Template</span>
          <span className="text-base-content/60 text-xs">Pre-fill settings from a template</span>
        </button>
      </div>

      {/* Template browser */}
      {creationMode === "template" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <FileText className="text-base-content/60 h-10 w-10" />
              <p className="text-base-content/60 text-sm">No templates found</p>
              <Link
                href="/k8s/templates/new"
                className="text-accent text-xs underline underline-offset-2"
              >
                Create a template
              </Link>
            </div>
          ) : (
            <div className="grid gap-2">
              {templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onTemplateSelect(t.name)}
                  disabled={templateLoading}
                  className={`flex items-start justify-between rounded-lg border p-3 text-left transition-colors ${
                    selectedTemplateName === t.name
                      ? "border-accent bg-accent/5"
                      : "hover:border-accent/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                    </div>
                    {t.description && (
                      <p className="text-base-content/60 mt-0.5 line-clamp-2 text-xs break-words">
                        {t.description}
                      </p>
                    )}
                    <div className="text-base-content/60 mt-1 flex gap-3 text-[10px]">
                      {t.image && <span>{t.image}</span>}
                      {t.size != null && (
                        <span>
                          {t.size} node{t.size !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {templateLoading && selectedTemplateName === t.name && (
                    <Loader2 className="text-accent h-4 w-4 animate-spin" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Template preview */}
          {templateDetail && selectedTemplateName && !templateLoading && (
            <div className="rounded-lg border p-4">
              <h4 className="mb-3 text-sm font-medium">
                Template Preview: <span className="text-accent">{templateDetail.name}</span>
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {PREVIEW_FIELDS.map(({ key, label }) => {
                  const formatted = formatTemplateSpecField(key, templateDetail.spec[key]);
                  if (!formatted) return null;
                  return (
                    <div key={key} className="contents">
                      <span className="text-base-content/60">{label}</span>
                      <span className="font-medium">{formatted}</span>
                    </div>
                  );
                })}
              </div>
              {templateDetail.status &&
                Array.isArray((templateDetail.status as Record<string, unknown>).usedBy) &&
                ((templateDetail.status as Record<string, unknown>).usedBy as string[]).length >
                  0 && (
                  <div className="mt-2 text-[10px]">
                    <span className="text-base-content/60">Used by: </span>
                    <span>
                      {((templateDetail.status as Record<string, unknown>).usedBy as string[]).join(
                        ", ",
                      )}
                    </span>
                  </div>
                )}
              <p className="text-base-content/60 mt-3 text-[10px]">
                These values will pre-fill the wizard. You can modify them in subsequent steps.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
