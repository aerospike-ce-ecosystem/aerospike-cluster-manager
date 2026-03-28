import { create } from "zustand";
import type {
  K8sTemplateSummary,
  K8sTemplateDetail,
  CreateK8sTemplateRequest,
  UpdateK8sTemplateRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { withLoading } from "@/lib/store-utils";

interface K8sTemplateState {
  templates: K8sTemplateSummary[];
  selectedTemplate: K8sTemplateDetail | null;
  loading: boolean;
  error: string | null;

  fetchTemplates: () => Promise<void>;
  fetchTemplate: (name: string) => Promise<void>;
  createTemplate: (data: CreateK8sTemplateRequest) => Promise<K8sTemplateSummary>;
  updateTemplate: (name: string, data: UpdateK8sTemplateRequest) => Promise<void>;
  deleteTemplate: (name: string) => Promise<void>;
}

export const useK8sTemplateStore = create<K8sTemplateState>()((set, get) => ({
  templates: [],
  selectedTemplate: null,
  loading: false,
  error: null,

  fetchTemplates: async () => {
    try {
      const templates = await api.getK8sTemplates();
      set({ templates });
    } catch (err) {
      // Don't set global error — template fetch failures should not block cluster pages
      // eslint-disable-next-line no-console -- intentional: surface template fetch failures
      console.warn("Failed to fetch K8s templates:", err);
    }
  },

  fetchTemplate: async (name: string) => {
    await withLoading(set, async () => {
      const template = await api.getK8sTemplate(name);
      set({ selectedTemplate: template });
    });
  },

  createTemplate: async (data: CreateK8sTemplateRequest) => {
    const result = await withLoading(
      set,
      async () => {
        const res = await api.createK8sTemplate(data);
        await get().fetchTemplates();
        return res;
      },
      { rethrow: true },
    );
    return result as K8sTemplateSummary;
  },

  updateTemplate: async (name: string, data: UpdateK8sTemplateRequest) => {
    await withLoading(
      set,
      async () => {
        await api.updateK8sTemplate(name, data);
        await get().fetchTemplate(name);
        await get().fetchTemplates();
      },
      { rethrow: true },
    );
  },

  deleteTemplate: async (name: string) => {
    await withLoading(
      set,
      async () => {
        await api.deleteK8sTemplate(name);
        set({ selectedTemplate: null });
        await get().fetchTemplates();
      },
      { rethrow: true },
    );
  },
}));
