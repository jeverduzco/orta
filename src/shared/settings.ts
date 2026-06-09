import { DEFAULT_TARGET_LANGUAGE } from './languages';
import { DEFAULT_APP_LANGUAGE } from './appLanguage';
import { DEFAULT_MODEL_ID } from './messages';

export type PublicOrtaSettings = {
  enabled: boolean;
  correctionEnabled: boolean;
  translationEnabled: boolean;
  /** Target language for translation. */
  targetLanguage: string;
  /** Language hint used when correcting (the language the text is written in). */
  correctionLanguage: string;
  appLanguage: string;
  disabledSites: string[];
  model: string;
};

export type SecretOrtaSettings = {
  apiKey: string;
};

export type OrtaSettings = PublicOrtaSettings & SecretOrtaSettings;

type SyncSettings = Omit<PublicOrtaSettings, 'disabledSites'>;
type LocalSettings = SecretOrtaSettings & Pick<PublicOrtaSettings, 'disabledSites'>;

export const publicDefaults: PublicOrtaSettings = {
  enabled: true,
  correctionEnabled: true,
  translationEnabled: true,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  correctionLanguage: DEFAULT_TARGET_LANGUAGE,
  appLanguage: DEFAULT_APP_LANGUAGE,
  disabledSites: [],
  model: DEFAULT_MODEL_ID,
};

export const secretDefaults: SecretOrtaSettings = {
  apiKey: '',
};

const syncDefaults: SyncSettings = {
  enabled: publicDefaults.enabled,
  correctionEnabled: publicDefaults.correctionEnabled,
  translationEnabled: publicDefaults.translationEnabled,
  targetLanguage: publicDefaults.targetLanguage,
  correctionLanguage: publicDefaults.correctionLanguage,
  appLanguage: publicDefaults.appLanguage,
  model: publicDefaults.model,
};

const localDefaults: LocalSettings = {
  apiKey: secretDefaults.apiKey,
  disabledSites: publicDefaults.disabledSites,
};

const getFromStorage = <T extends Record<string, unknown>>(
  area: chrome.storage.StorageArea,
  defaults: T,
): Promise<T> =>
  new Promise((resolve) => {
    area.get(defaults, (values) => {
      resolve(values as T);
    });
  });

const setInStorage = <T extends Record<string, unknown>>(
  area: chrome.storage.StorageArea,
  values: Partial<T>,
): Promise<void> =>
  new Promise((resolve) => {
    area.set(values, () => resolve());
  });

const removeFromStorage = (area: chrome.storage.StorageArea, keys: string[]): Promise<void> =>
  new Promise((resolve) => {
    area.remove(keys, () => resolve());
  });

let didMigrate = false;

/**
 * Migrates `disabledSites` from sync to local storage so the list can grow
 * past chrome.storage.sync's 8KB-per-item quota. One-shot per session.
 */
const migrateDisabledSitesIfNeeded = async (): Promise<string[] | null> => {
  if (didMigrate) {
    return null;
  }
  didMigrate = true;

  const syncRecord = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.sync.get('disabledSites', (values) => resolve(values));
  });

  const syncValue = syncRecord.disabledSites;

  if (!Array.isArray(syncValue) || syncValue.length === 0) {
    return null;
  }

  const localExisting = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get('disabledSites', (values) => resolve(values));
  });

  const localValue = localExisting.disabledSites;
  const target = Array.isArray(localValue) && localValue.length > 0 ? null : syncValue.filter((site): site is string => typeof site === 'string');

  if (target) {
    await setInStorage<LocalSettings>(chrome.storage.local, { disabledSites: target });
  }

  await removeFromStorage(chrome.storage.sync, ['disabledSites']);
  return target;
};

export const getPublicSettings = async (): Promise<PublicOrtaSettings> => {
  const migrated = await migrateDisabledSitesIfNeeded();

  const [sync, local] = await Promise.all([
    getFromStorage<SyncSettings>(chrome.storage.sync, syncDefaults),
    getFromStorage<LocalSettings>(chrome.storage.local, localDefaults),
  ]);

  return {
    ...sync,
    disabledSites: migrated ?? local.disabledSites,
  };
};

export const setPublicSettings = async (values: Partial<PublicOrtaSettings>): Promise<void> => {
  const { disabledSites, ...syncValues } = values;
  const tasks: Promise<void>[] = [];

  if (Object.keys(syncValues).length > 0) {
    tasks.push(setInStorage<SyncSettings>(chrome.storage.sync, syncValues));
  }

  if (disabledSites !== undefined) {
    tasks.push(setInStorage<LocalSettings>(chrome.storage.local, { disabledSites }));
  }

  await Promise.all(tasks);
};

export const getSecretSettings = async (): Promise<SecretOrtaSettings> => {
  const local = await getFromStorage<LocalSettings>(chrome.storage.local, localDefaults);
  return { apiKey: local.apiKey };
};

export const setSecretSettings = async (values: Partial<SecretOrtaSettings>): Promise<void> =>
  setInStorage<LocalSettings>(chrome.storage.local, values);

export const getSettings = async (): Promise<OrtaSettings> => {
  const [publicSettings, secretSettings] = await Promise.all([
    getPublicSettings(),
    getSecretSettings(),
  ]);

  return {
    ...publicSettings,
    ...secretSettings,
  };
};
