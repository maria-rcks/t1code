import { useCallback } from "react";
import {
  APP_SETTINGS_STORAGE_KEY,
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
} from "@t3tools/client-core";
import { useLocalStorage } from "./hooks/useLocalStorage";

export {
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
  DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
  DEFAULT_SIDEBAR_THREAD_SORT_ORDER,
  DEFAULT_TIMESTAMP_FORMAT,
  getAppModelOptions,
  getCustomModelOptionsByProvider,
  getCustomModelsByProvider,
  getCustomModelsForProvider,
  getDefaultCustomModelsForProvider,
  getProviderStartOptions,
  MAX_CUSTOM_MODEL_LENGTH,
  MODEL_PROVIDER_SETTINGS,
  normalizeCustomModelSlugs,
  patchCustomModels,
  resolveAppModelSelection,
  TimestampFormat,
} from "@t3tools/client-core";
export type { AppModelOption, AppSettings, ProviderCustomModelConfig } from "@t3tools/client-core";

export function useAppSettings() {
  const [settings, setSettings] = useLocalStorage(
    APP_SETTINGS_STORAGE_KEY,
    DEFAULT_APP_SETTINGS,
    AppSettingsSchema,
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => normalizeAppSettings({ ...prev, ...patch }));
    },
    [setSettings],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
  }, [setSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    defaults: DEFAULT_APP_SETTINGS,
  } as const;
}
