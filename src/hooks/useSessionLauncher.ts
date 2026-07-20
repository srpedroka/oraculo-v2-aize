import { useCallback, useRef, useState } from "react";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import type { AppAction } from "../state/store-contract";
import type { PlanningSessionType } from "../types";

export interface SessionLaunchRequest {
  sessionType: PlanningSessionType;
  areaId?: string | null;
  period: string;
}

function requestKey(request: SessionLaunchRequest) {
  return [request.sessionType, request.areaId ?? "company", request.period].join(":");
}

export function useSessionLauncher(dispatch: (action: AppAction) => void) {
  const pendingRef = useRef(false);
  const retryRef = useRef<SessionLaunchRequest | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<RecoverableFeedback | null>(null);

  const startSession = useCallback((request: SessionLaunchRequest) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    retryRef.current = request;
    setPendingKey(requestKey(request));
    setError(null);
    dispatch({
      type: "start_session",
      ...request,
      onSuccess: () => {
        pendingRef.current = false;
        setPendingKey(null);
        setError(null);
      },
      onError: (message) => {
        pendingRef.current = false;
        setPendingKey(null);
        setError(recoverableFeedback(
          message,
          "Não consegui iniciar esta condução.",
          "Nada foi gravado. Tente novamente sem perder o ponto de partida.",
          "SESSION_START_FAILED",
        ));
      },
    });
  }, [dispatch]);

  const retry = useCallback(() => {
    if (retryRef.current) startSession(retryRef.current);
  }, [startSession]);

  return {
    error,
    pending: pendingKey !== null,
    isStarting: (request: SessionLaunchRequest) => pendingKey === requestKey(request),
    retry,
    startSession,
  };
}

