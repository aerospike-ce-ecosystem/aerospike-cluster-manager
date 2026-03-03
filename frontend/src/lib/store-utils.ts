import { getErrorMessage } from "@/lib/utils";

type SetFn<T> = (partial: Partial<T>) => void;

/**
 * Helper to reduce boilerplate for async store actions that follow the pattern:
 *   set({ <loadingKey>: true, error: null });
 *   try { ... set({ <loadingKey>: false }); }
 *   catch { set({ error: ..., <loadingKey>: false }); }
 *
 * @param set - Zustand set function
 * @param fn - Async function to execute
 * @param opts.loadingKey - The state key to toggle (default: "loading")
 * @param opts.rethrow - Whether to rethrow caught errors (default: false)
 */
export async function withLoading<T extends { loading: boolean; error: string | null }, R>(
  set: SetFn<T>,
  fn: () => Promise<R>,
  opts?: { rethrow?: boolean },
): Promise<R | undefined> {
  set({ loading: true, error: null } as Partial<T>);
  try {
    const result = await fn();
    set({ loading: false } as Partial<T>);
    return result;
  } catch (error) {
    set({ error: getErrorMessage(error), loading: false } as Partial<T>);
    if (opts?.rethrow) throw error;
    return undefined;
  }
}
