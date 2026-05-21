import { useEffect, useRef, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AutoRefreshState {
  enabled: boolean;
  intervalSec: number;
  countdown: number;        // seconds until next refresh
  lastRefreshed: Date | null;
  refreshing: boolean;
}

export function useAutoRefresh(cfg: any | undefined) {
  const isMock = !cfg || cfg.useMockData;
  const enabled = !isMock && (cfg?.autoRefreshEnabled ?? false);
  const intervalSec = cfg?.autoRefreshInterval ?? 300;

  const [countdown, setCountdown] = useState(intervalSec);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await apiRequest("POST", "/api/refresh");
      await queryClient.invalidateQueries();
      setLastRefreshed(new Date());
    } catch (_) {}
    finally { setRefreshing(false); }
    setCountdown(intervalSec);
  }

  useEffect(() => {
    // Clear existing timers
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (!enabled) {
      setCountdown(intervalSec);
      return;
    }

    setCountdown(intervalSec);

    // Main refresh timer
    timerRef.current = setInterval(doRefresh, intervalSec * 1000);

    // Countdown ticker (every second)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, intervalSec]);

  return { enabled, intervalSec, countdown, lastRefreshed, refreshing, doRefresh } satisfies AutoRefreshState & { doRefresh: () => Promise<void> };
}
