import {
  DEFAULT_MODEL_ID,
  MODEL_OPTIONS,
  type ValidateGatewayResponse,
} from '../shared/messages';
import {
  getTargetLanguageLabel,
  normalizeTargetLanguage,
  TARGET_LANGUAGE_REGISTRY,
} from '../shared/languages';
import { APP_LANGUAGES, normalizeAppLanguage } from '../shared/appLanguage';
import { getCopy } from '../shared/i18n';
import {
  getPublicSettings,
  getSecretSettings,
  setPublicSettings,
  setSecretSettings,
  type PublicOrtaSettings,
} from '../shared/settings';
import { normalizeSitePattern } from '../shared/sites';
import { BUILTIN_BLOCKED_DOMAINS } from '../shared/blockedDomains';
import './options.css';

const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
};

const apiForm = getElement<HTMLFormElement>('#api-form');
const apiInput = getElement<HTMLInputElement>('#api-key');
const toggleKeyButton = getElement<HTMLButtonElement>('#toggle-key');
const testKeyButton = getElement<HTMLButtonElement>('#test-key');
const apiStatus = getElement<HTMLSpanElement>('#api-status');
const enabledInput = getElement<HTMLInputElement>('#enabled');
const correctionInput = getElement<HTMLInputElement>('#correction-enabled');
const translationInput = getElement<HTMLInputElement>('#translation-enabled');
const appLanguageInput = getElement<HTMLSelectElement>('#app-language');
const targetLanguageInput = getElement<HTMLSelectElement>('#target-language');
const blockedForm = getElement<HTMLFormElement>('#blocked-form');
const blockedInput = getElement<HTMLInputElement>('#blocked-site');
const blockedList = getElement<HTMLUListElement>('#blocked-list');
const builtinList = getElement<HTMLUListElement>('#builtin-list');
const modelSelect = getElement<HTMLSelectElement>('#model');
const toast = getElement<HTMLElement>('#toast');

let publicSettings: PublicOrtaSettings | null = null;
let toastTimeout: number | undefined;

const renderLanguageOptions = (appLanguage: string): void => {
  const normalizedApp = normalizeAppLanguage(appLanguage);

  targetLanguageInput.innerHTML = '';
  appLanguageInput.innerHTML = '';

  for (const language of APP_LANGUAGES) {
    const option = document.createElement('option');
    option.value = language.value;
    option.textContent = language.label;
    appLanguageInput.append(option);
  }

  for (const entry of TARGET_LANGUAGE_REGISTRY) {
    const option = document.createElement('option');
    option.value = entry.code;
    option.textContent = getTargetLanguageLabel(entry.code, normalizedApp);
    targetLanguageInput.append(option);
  }
};

const renderModelOptions = (): void => {
  modelSelect.innerHTML = '';
  for (const optionDef of MODEL_OPTIONS) {
    const option = document.createElement('option');
    option.value = optionDef.id;
    option.textContent = optionDef.label;
    modelSelect.append(option);
  }
};

const applyOptionsLanguage = (language: string): void => {
  const appLanguage = normalizeAppLanguage(language);
  const copy = getCopy(appLanguage);

  document.documentElement.lang = appLanguage;
  document.title = copy.settingsTitleDocument;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as keyof typeof copy | undefined;

    if (key && copy[key]) {
      element.textContent = copy[key];
    }
  });

  syncKeyVisibilityButton();
  renderLanguageOptions(appLanguage);
  // renderLanguageOptions rebuilds <option>s, which wipes the select value;
  // restore the active selection here so the dropdown reflects current state.
  appLanguageInput.value = appLanguage;
  if (publicSettings) {
    targetLanguageInput.value = normalizeTargetLanguage(publicSettings.targetLanguage);
  }
  targetLanguageInput.setAttribute('aria-label', copy.targetLanguageLabel);
  appLanguageInput.setAttribute('aria-label', copy.appLanguageLabel);
};

const showToast = (message: string): void => {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.setAttribute('data-visible', 'true');
  toastTimeout = window.setTimeout(() => {
    toast.removeAttribute('data-visible');
  }, 2400);
};

const setApiStatus = (label: string, state: 'idle' | 'valid' | 'error' | 'loading'): void => {
  apiStatus.textContent = label;
  apiStatus.dataset.state = state;
};

const refreshApiStatusFromKey = (apiKey: string): void => {
  const copy = getCopy(publicSettings?.appLanguage ?? 'es');
  if (apiKey) {
    setApiStatus(copy.apiSaved, 'valid');
  } else {
    setApiStatus(copy.apiPending, 'idle');
  }
};

const sendValidateGatewayKey = (apiKey?: string, model?: string): Promise<ValidateGatewayResponse> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'orta:validateGatewayKey',
        apiKey,
        model,
      },
      (response: ValidateGatewayResponse | undefined) => {
        const copy = getCopy(publicSettings?.appLanguage ?? 'es');
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? copy.gatewayContactFailed });
          return;
        }

        resolve(response ?? { ok: false, error: copy.noResponse });
      },
    );
  });

const hasOverrideForDomain = (domain: string): boolean => {
  if (!publicSettings) {
    return false;
  }

  const target = `!${normalizeSitePattern(domain)}`;
  return publicSettings.disabledSites.some((entry) => normalizeSitePattern(entry) === target);
};

const persistDisabledSites = async (nextSites: string[]): Promise<void> => {
  if (!publicSettings) {
    return;
  }

  publicSettings = { ...publicSettings, disabledSites: nextSites };
  await setPublicSettings({ disabledSites: nextSites });
};

const toggleBuiltinOverride = async (domain: string): Promise<void> => {
  if (!publicSettings) {
    return;
  }

  const overrideToken = `!${normalizeSitePattern(domain)}`;
  const copy = getCopy(publicSettings.appLanguage);
  const wasOverridden = hasOverrideForDomain(domain);

  const nextSites = wasOverridden
    ? publicSettings.disabledSites.filter((entry) => normalizeSitePattern(entry) !== overrideToken)
    : [...publicSettings.disabledSites, overrideToken].sort((a, b) => a.localeCompare(b));

  await persistDisabledSites(nextSites);
  renderBlockedSites();
  renderBuiltinList();
  showToast(wasOverridden ? copy.builtinOverrideRemoved : copy.builtinOverrideAdded);
};

const renderBlockedSites = (): void => {
  if (!publicSettings) {
    return;
  }

  const copy = getCopy(publicSettings.appLanguage);
  blockedList.innerHTML = '';

  const userBlocks = publicSettings.disabledSites.filter((site) => !normalizeSitePattern(site).startsWith('!'));

  if (userBlocks.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = copy.blockedEmpty;
    blockedList.append(emptyItem);
    return;
  }

  for (const site of userBlocks) {
    const item = document.createElement('li');
    item.className = 'blocked-item';

    const label = document.createElement('span');
    label.textContent = site;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = copy.removeButton;
    removeButton.addEventListener('click', async () => {
      if (!publicSettings) {
        return;
      }

      const nextSites = publicSettings.disabledSites.filter((candidate) => candidate !== site);
      await persistDisabledSites(nextSites);
      renderBlockedSites();
      showToast(getCopy(publicSettings.appLanguage).blockedRemoved);
    });

    item.append(label, removeButton);
    blockedList.append(item);
  }
};

const renderBuiltinList = (): void => {
  if (!publicSettings) {
    return;
  }

  const copy = getCopy(publicSettings.appLanguage);
  builtinList.innerHTML = '';

  for (const domain of BUILTIN_BLOCKED_DOMAINS) {
    const item = document.createElement('li');
    item.className = 'blocked-item builtin-item';
    const isOverridden = hasOverrideForDomain(domain);
    if (isOverridden) {
      item.dataset.overridden = 'true';
    }

    const label = document.createElement('span');
    label.textContent = domain;

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = isOverridden ? 'builtin-toggle is-allowed' : 'builtin-toggle';
    toggleButton.textContent = isOverridden ? copy.builtinBlockButton : copy.builtinAllowButton;
    toggleButton.setAttribute('aria-pressed', String(isOverridden));
    toggleButton.addEventListener('click', () => {
      void toggleBuiltinOverride(domain);
    });

    item.append(label, toggleButton);
    builtinList.append(item);
  }
};

const renderSettings = (settings: PublicOrtaSettings, apiKey: string): void => {
  publicSettings = settings;

  apiInput.value = apiKey;
  enabledInput.checked = settings.enabled;
  correctionInput.checked = settings.correctionEnabled;
  translationInput.checked = settings.translationEnabled;
  appLanguageInput.value = normalizeAppLanguage(settings.appLanguage);

  applyOptionsLanguage(settings.appLanguage);
  targetLanguageInput.value = normalizeTargetLanguage(settings.targetLanguage);
  modelSelect.value = settings.model ?? DEFAULT_MODEL_ID;

  refreshApiStatusFromKey(apiKey);
  renderBlockedSites();
  renderBuiltinList();
};

const syncKeyVisibilityButton = (): void => {
  const isVisible = apiInput.type === 'text';
  const copy = getCopy(publicSettings?.appLanguage ?? 'es');

  toggleKeyButton.dataset.visible = String(isVisible);
  toggleKeyButton.setAttribute('aria-pressed', String(isVisible));
  toggleKeyButton.setAttribute('aria-label', isVisible ? copy.apiKeyToggleHide : copy.apiKeyToggleShow);
};

const updatePublicSetting = async (values: Partial<PublicOrtaSettings>): Promise<void> => {
  if (!publicSettings) {
    return;
  }

  publicSettings = {
    ...publicSettings,
    ...values,
  };

  await setPublicSettings(values);
};

apiForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const trimmedKey = apiInput.value.trim();
  await setSecretSettings({ apiKey: trimmedKey });
  refreshApiStatusFromKey(trimmedKey);
  showToast(getCopy(publicSettings?.appLanguage ?? 'es').apiKeySaved);
});

toggleKeyButton.addEventListener('click', () => {
  const isPassword = apiInput.type === 'password';
  apiInput.type = isPassword ? 'text' : 'password';
  syncKeyVisibilityButton();
});

testKeyButton.addEventListener('click', async () => {
  const apiKey = apiInput.value.trim();
  const copy = getCopy(publicSettings?.appLanguage ?? 'es');

  if (!apiKey) {
    setApiStatus(copy.apiPending, 'idle');
    showToast(copy.apiMissing);
    return;
  }

  setApiStatus(copy.apiStatusLoading, 'loading');
  const modelForTest = modelSelect.value || DEFAULT_MODEL_ID;
  const response = await sendValidateGatewayKey(apiKey, modelForTest);

  if (response.ok) {
    setApiStatus(copy.apiStatusReady, 'valid');
    showToast(`${copy.connectionReady} · ${response.model || modelForTest}`);
    return;
  }

  setApiStatus(copy.apiStatusError, 'error');
  showToast(response.error);
});

enabledInput.addEventListener('change', () => {
  void updatePublicSetting({ enabled: enabledInput.checked });
});

correctionInput.addEventListener('change', () => {
  void updatePublicSetting({ correctionEnabled: correctionInput.checked });
});

translationInput.addEventListener('change', () => {
  void updatePublicSetting({ translationEnabled: translationInput.checked });
});

appLanguageInput.addEventListener('change', () => {
  const appLanguage = normalizeAppLanguage(appLanguageInput.value);
  appLanguageInput.value = appLanguage;
  void updatePublicSetting({ appLanguage }).then(() => {
    applyOptionsLanguage(appLanguage);
    targetLanguageInput.value = normalizeTargetLanguage(publicSettings?.targetLanguage ?? appLanguage);
    refreshApiStatusFromKey(apiInput.value.trim());
    renderBlockedSites();
    renderBuiltinList();
    showToast(getCopy(appLanguage).appLanguageSaved);
  });
});

targetLanguageInput.addEventListener('change', () => {
  const targetLanguage = normalizeTargetLanguage(targetLanguageInput.value);
  targetLanguageInput.value = targetLanguage;
  const copy = getCopy(publicSettings?.appLanguage ?? 'es');
  void updatePublicSetting({ targetLanguage });
  showToast(`${copy.targetLanguageSaved}: ${getTargetLanguageLabel(targetLanguage, normalizeAppLanguage(publicSettings?.appLanguage ?? 'es'))}`);
});

modelSelect.addEventListener('change', () => {
  const model = modelSelect.value;
  void updatePublicSetting({ model });
  const copy = getCopy(publicSettings?.appLanguage ?? 'es');
  const selected = MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;
  showToast(`${copy.modelSaved}: ${selected}`);
});

blockedForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!publicSettings) {
    return;
  }

  const copy = getCopy(publicSettings.appLanguage);
  const site = normalizeSitePattern(blockedInput.value);

  if (!site) {
    showToast(copy.blockedDomainInvalid);
    return;
  }

  if (publicSettings.disabledSites.includes(site)) {
    blockedInput.value = '';
    showToast(copy.blockedExisting);
    return;
  }

  const disabledSites = [...publicSettings.disabledSites, site].sort((a, b) => a.localeCompare(b));
  await updatePublicSetting({ disabledSites });
  blockedInput.value = '';
  renderBlockedSites();
  showToast(copy.blockedSaved);
});

void Promise.all([getPublicSettings(), getSecretSettings()]).then(([settings, secrets]) => {
  renderModelOptions();
  renderSettings(settings, secrets.apiKey);
});
