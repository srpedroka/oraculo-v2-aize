import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ supabase: null }));

import { AppProvider, useAppState } from "./store";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}><AppProvider>{children}</AppProvider></QueryClientProvider>;
}

describe("store facade compatibility", () => {
  afterEach(cleanup);

  it("preserva o contrato público usado pelas telas", async () => {
    const { result } = renderHook(() => useAppState(), { wrapper });
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(Object.keys(result.current).sort()).toEqual([
      "applyKpiSpreadsheetSuggestion", "dispatch", "passwordRecoveryActive", "refresh", "resetPasswordForEmail",
      "saveAiFunctionSetting", "saveAiProviderKey", "saveOrgTone", "session", "signIn", "signOut", "signUp", "state",
      "suggestKpiSpreadsheet", "testAiFunction", "testAiProviderKey", "updatePassword", "updateProfile",
    ].sort());
    expect(result.current.state.ready).toBe(false);
    expect(result.current.state.organizations).toEqual([]);
  });

  it("mantém as ações locais de navegação sem depender dos domínios remotos", async () => {
    const { result } = renderHook(() => useAppState(), { wrapper });
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    act(() => result.current.dispatch({ type: "toggle_sidebar" }));
    expect(result.current.state.ui.sidebarCollapsed).toBe(true);

    act(() => result.current.dispatch({ type: "set_sidebar_width", width: 999 }));
    expect(result.current.state.ui.sidebarWidth).toBe(320);
    expect(result.current.state.ui.sidebarCollapsed).toBe(false);
  });
});
