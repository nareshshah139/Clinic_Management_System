import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";

type Resource<T> =
  | { status: "loading"; url: string }
  | { status: "ready"; url: string; data: T }
  | { status: "error"; url: string; error: string };

/**
 * @cc [owner:nareshshah139,label:product] inventory-query-read-state
 * Expose results only for the current query and latest request. Loading and failed
 * reads have no result count; retry clears the read error and keeps the current query,
 * including reload callbacks retained by an earlier mutation.
 */
export function useInventoryResource<T>(url: string) {
  const [resource, setResource] = useState<Resource<T>>({ status: "loading", url });
  const sequence = useRef(0);
  const currentUrl = useRef<string | null>(null);
  const reload = useCallback(async () => {
    const url = currentUrl.current;
    if (url === null) return;
    const request = ++sequence.current;
    setResource({ status: "loading", url });
    try {
      const data = await apiClient.get<T>(url);
      if (request === sequence.current) setResource({ status: "ready", url, data });
    } catch (error) {
      if (request === sequence.current) setResource({
        status: "error", url,
        error: error instanceof Error && error.message.trim() ? error.message : "Could not load records. Try again.",
      });
    }
  }, []);
  useEffect(() => {
    currentUrl.current = url;
    void reload();
    return () => { currentUrl.current = null; ++sequence.current; };
  }, [url, reload]);
  const current: Resource<T> = resource.url === url ? resource : { status: "loading", url };
  return {
    status: current.status,
    data: current.status === "ready" ? current.data : undefined,
    error: current.status === "error" ? current.error : "",
    reload,
  };
}
