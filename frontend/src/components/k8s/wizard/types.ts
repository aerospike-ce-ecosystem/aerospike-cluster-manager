import type {
  CreateK8sClusterRequest,
  K8sNodeInfo,
  StorageVolumeConfig,
  TemplateOverrides,
  K8sTemplateSummary,
} from "@/lib/api/types";

export interface WizardStepProps {
  form: CreateK8sClusterRequest;
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void;
}

export interface WizardBasicStepProps extends WizardStepProps {
  k8sNamespaces: string[];
  fetchingOptions: boolean;
}

export interface WizardNamespaceStorageStepProps extends WizardStepProps {
  storageClasses: string[];
  defaultStorage: StorageVolumeConfig;
}

export interface WizardMonitoringStepProps extends WizardStepProps {
  templates: K8sTemplateSummary[];
  overridesOpen: boolean;
  setOverridesOpen: (open: boolean) => void;
  templateOverrides: TemplateOverrides;
  setTemplateOverrides: (overrides: TemplateOverrides) => void;
}

export interface WizardResourcesStepProps extends WizardStepProps {
  defaultResources: { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };
}

export interface WizardAclStepProps extends WizardStepProps {
  k8sSecrets: string[];
}

export type WizardRollingUpdateStepProps = WizardStepProps;

export interface WizardRackConfigStepProps extends WizardStepProps {
  nodes: K8sNodeInfo[];
}

export interface WizardReviewStepProps {
  form: CreateK8sClusterRequest;
  formatBytes: (bytes: number) => string;
}
