import type {
  CreateK8sClusterRequest,
  K8sNodeInfo,
  K8sTemplateDetail,
  K8sTemplateSummary,
  StorageVolumeConfig,
  StorageSpec,
} from "@/lib/api/types";

export interface WizardStepProps {
  form: CreateK8sClusterRequest;
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void;
}

export interface WizardCreationModeStepProps extends WizardStepProps {
  templates: K8sTemplateSummary[];
  creationMode: "scratch" | "template";
  setCreationMode: (mode: "scratch" | "template") => void;
  selectedTemplateName: string | null;
  onTemplateSelect: (name: string) => void;
  templateDetail: K8sTemplateDetail | null;
  templateLoading: boolean;
}

export interface WizardBasicStepProps extends WizardStepProps {
  k8sNamespaces: string[];
  fetchingOptions: boolean;
  defaultResources: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}

export interface WizardNamespaceStorageStepProps extends WizardStepProps {
  storageClasses: string[];
  defaultStorage: StorageVolumeConfig;
  defaultStorageSpec: StorageSpec;
}

export type WizardMonitoringStepProps = WizardStepProps;

export interface WizardResourcesStepProps extends WizardStepProps {
  defaultResources: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}

export interface WizardAclStepProps extends WizardStepProps {
  k8sSecrets: string[];
}

export type WizardRollingUpdateStepProps = WizardStepProps;

export interface WizardRackConfigStepProps extends WizardStepProps {
  nodes: K8sNodeInfo[];
}

export interface WizardAdvancedStepProps extends WizardStepProps {
  k8sSecrets: string[];
  nodes: K8sNodeInfo[];
}

export interface WizardReviewStepProps {
  form: CreateK8sClusterRequest;
  updateForm?: (updates: Partial<CreateK8sClusterRequest>) => void;
  formatBytes: (bytes: number) => string;
  isTemplateMode?: boolean;
}
