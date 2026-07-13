import type { OracleMode } from "../types";
import type { AppAction } from "./store-contract";

export interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  mobileNavOpen: boolean;
  oracleMode: OracleMode;
}

export const INITIAL_UI: UiState = {
  sidebarCollapsed: false,
  sidebarWidth: 240,
  mobileNavOpen: false,
  oracleMode: "minimized",
};

export function uiReducer(state: UiState, action: AppAction): UiState {
  switch (action.type) {
    case "toggle_sidebar":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case "set_sidebar_width":
      return { ...state, sidebarWidth: Math.max(188, Math.min(320, action.width)), sidebarCollapsed: false };
    case "toggle_mobile_nav":
      return { ...state, mobileNavOpen: !state.mobileNavOpen, sidebarCollapsed: false };
    case "open_mobile_nav":
      return { ...state, mobileNavOpen: true, sidebarCollapsed: false };
    case "close_mobile_nav":
      return { ...state, mobileNavOpen: false };
    case "set_oracle_mode":
      return { ...state, oracleMode: action.mode };
    default:
      return state;
  }
}
