import { useCallback, useEffect, useRef, useState } from "react";

/** Tiny data-fetching hook: { data, loading, error, reload }. */
export function useResource<T>(fetcher: () => Promise<T>, autoload = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(autoload);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fetcher);
  useEffect(() => { ref.current = fetcher; });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await ref.current()); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (autoload) void reload(); }, [autoload, reload]);
  return { data, loading, error, reload };
}
