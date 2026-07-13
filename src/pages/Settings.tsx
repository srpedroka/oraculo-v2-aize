import { SettingsView } from "../features/settings/SettingsView";
import { useSettingsController } from "../features/settings/use-settings-controller";

export function Settings() {
  const scope = useSettingsController();
  return <SettingsView scope={scope} />;
}
