/**
 * K8s template store — list of AerospikeClusterTemplate CRs + selected detail.
 * Ported from frontend/src/stores/k8s-template-store.ts (simplified for renewal).
 */

"use client"

import { create } from "zustand"

import {
  createK8sTemplate,
  deleteK8sTemplate,
  getK8sTemplate,
  listK8sTemplates,
  updateK8sTemplate,
} from "@/lib/api/k8s"
import type {
  CreateK8sTemplateRequest,
  K8sTemplateDetail,
  K8sTemplateSummary,
  UpdateK8sTemplateRequest,
} from "@/lib/types/k8s"

interface K8sTemplateState {
  templates: K8sTemplateSummary[]
  selectedTemplate: K8sTemplateDetail | null
  loading: boolean
  error: string | null

  fetchTemplates: () => Promise<void>
  fetchTemplate: (name: string) => Promise<void>
  createTemplate: (
    data: CreateK8sTemplateRequest,
  ) => Promise<K8sTemplateSummary>
  updateTemplate: (
    name: string,
    data: UpdateK8sTemplateRequest,
  ) => Promise<void>
  deleteTemplate: (name: string) => Promise<void>
}

export const useK8sTemplateStore = create<K8sTemplateState>()((set, get) => ({
  templates: [],
  selectedTemplate: null,
  loading: false,
  error: null,

  fetchTemplates: async () => {
    try {
      const templates = await listK8sTemplates()
      set({ templates, error: null })
    } catch (err) {
      // Template fetch failures should not block cluster pages.
      // eslint-disable-next-line no-console -- intentional: surface template fetch failures
      console.warn("Failed to fetch K8s templates:", err)
    }
  },

  fetchTemplate: async (name: string) => {
    set({ loading: true, error: null })
    try {
      const template = await getK8sTemplate(name)
      set({ selectedTemplate: template, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  createTemplate: async (data: CreateK8sTemplateRequest) => {
    set({ loading: true, error: null })
    try {
      const res = await createK8sTemplate(data)
      await get().fetchTemplates()
      set({ loading: false })
      return res
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },

  updateTemplate: async (name: string, data: UpdateK8sTemplateRequest) => {
    set({ loading: true, error: null })
    try {
      await updateK8sTemplate(name, data)
      await get().fetchTemplate(name)
      await get().fetchTemplates()
      set({ loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },

  deleteTemplate: async (name: string) => {
    set({ loading: true, error: null })
    try {
      await deleteK8sTemplate(name)
      set({ selectedTemplate: null, loading: false })
      await get().fetchTemplates()
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
}))
