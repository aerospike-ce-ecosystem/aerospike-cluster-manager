import type {
  CreateK8sClusterRequest,
  K8sTemplateDetail,
  K8sTemplateSummary,
} from "@/lib/types/k8s";

export type CreationMode = "scratch" | "template";

export interface WizardForm extends CreateK8sClusterRequest {
  // All fields come from CreateK8sClusterRequest; this alias documents intent.
}

export interface WizardContext {
  mode: CreationMode;
  selectedTemplateName: string | null;
  templateDetail: K8sTemplateDetail | null;
  templates: K8sTemplateSummary[];
  templateLoading: boolean;
  namespacesList: string[];
}

export const STEP_LABELS_SCRATCH = [
  "Creation Mode",
  "Basic & Resources",
  "Namespace & Storage",
  "Advanced",
  "Review",
] as const;

export const STEP_LABELS_TEMPLATE = [
  "Creation Mode",
  "Name & Namespace",
  "Namespace & Storage",
  "Review",
] as const;
