import type { CreateK8sClusterRequest } from "@/lib/types/k8s"

export interface WizardFormState extends CreateK8sClusterRequest {
  name: string
  namespace: string
  size: number
  image: string
}

export interface WizardStepProps {
  form: WizardFormState
  updateForm: (updates: Partial<WizardFormState>) => void
}
