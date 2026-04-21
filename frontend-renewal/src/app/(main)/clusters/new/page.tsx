import { CreateClusterWizard } from "@/components/k8s/create-cluster-wizard/CreateClusterWizard";

export default function NewClusterPage() {
  return (
    <main className="flex flex-col gap-6">
      <CreateClusterWizard />
    </main>
  );
}
