import { getPublicSettings, setPublicSettings, type PublicOrtaSettings } from '../shared/settings';
import { getCopy } from '../shared/i18n';
import {
  getHostnameFromUrl,
  isHostnameBlocked,
  isHostnameBlockedByBuiltin,
  isOrtaAvailableForUrl,
  normalizeSitePattern,
} from '../shared/sites';
import { isAuthLikePath } from '../shared/pageGuard';
import './popup.css';

const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
};

const siteStatus = getElement<HTMLElement>('#site-status');
const enabledInput = getElement<HTMLInputElement>('#enabled');
const correctionInput = getElement<HTMLInputElement>('#correction-enabled');
const translationInput = getElement<HTMLInputElement>('#translation-enabled');
const siteToggleButton = getElement<HTMLButtonElement>('#site-toggle');
const openOptionsButton = getElement<HTMLButtonElement>('#open-options');

let settings: PublicOrtaSettings | null = null;
let activeHostname = '';
let activeUrl = '';

const getActiveTabUrl = async (): Promise<string> =>
  new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      resolve(tab?.url ?? '');
    });
  });

const updatePublicSetting = async (values: Partial<PublicOrtaSettings>): Promise<void> => {
  if (!settings) {
    return;
  }

  settings = {
    ...settings,
    ...values,
  };

  await setPublicSettings(values);
  renderState();
};

type SiteState = 'unavailable' | 'userBlocked' | 'safetyBlocked' | 'protectedPage' | 'active';

const getSiteState = (current: PublicOrtaSettings): SiteState => {
  if (!activeHostname || !/^https?:/i.test(activeUrl)) return 'unavailable';
  if (isHostnameBlocked(activeHostname, current.disabledSites)) return 'userBlocked';
  if (isHostnameBlockedByBuiltin(activeHostname) && !isOrtaAvailableForUrl(activeUrl, { ...current, enabled: true, correctionEnabled: true })) {
    return 'safetyBlocked';
  }
  if (isAuthLikePath(activeUrl)) return 'protectedPage';
  return 'active';
};

const renderState = (): void => {
  if (!settings) {
    return;
  }

  const copy = getCopy(settings.appLanguage);
  const state = getSiteState(settings);
  document.documentElement.lang = settings.appLanguage;

  enabledInput.checked = settings.enabled;
  correctionInput.checked = settings.correctionEnabled;
  translationInput.checked = settings.translationEnabled;

  const statusPrefix: Record<SiteState, string> = {
    unavailable: copy.popupNotAvailable,
    userBlocked: `${copy.popupDisabledOn} ${activeHostname}`,
    safetyBlocked: `${copy.popupBlockedForSafety} ${activeHostname}`,
    protectedPage: copy.popupProtectedPage,
    active: `${copy.popupActiveOn} ${activeHostname}`,
  };
  siteStatus.textContent = statusPrefix[state];
  siteStatus.dataset.state = state;

  siteToggleButton.textContent =
    state === 'userBlocked'
      ? copy.popupEnableHere
      : state === 'safetyBlocked'
        ? copy.builtinAllowButton
        : copy.popupDisableHere;
  siteToggleButton.disabled = state === 'unavailable';
  openOptionsButton.textContent = copy.popupOpenSettings;

  const enabledLabel = document.querySelector('[data-popup-label="enabled"]');
  const correctLabel = document.querySelector('[data-popup-label="correct"]');
  const translateLabel = document.querySelector('[data-popup-label="translate"]');
  if (enabledLabel) enabledLabel.textContent = copy.popupEnabled;
  if (correctLabel) correctLabel.textContent = copy.popupCorrect;
  if (translateLabel) translateLabel.textContent = copy.popupTranslate;
};

enabledInput.addEventListener('change', () => {
  void updatePublicSetting({ enabled: enabledInput.checked });
});

correctionInput.addEventListener('change', () => {
  void updatePublicSetting({ correctionEnabled: correctionInput.checked });
});

translationInput.addEventListener('change', () => {
  void updatePublicSetting({ translationEnabled: translationInput.checked });
});

siteToggleButton.addEventListener('click', async () => {
  if (!settings || !activeHostname) {
    return;
  }

  const state = getSiteState(settings);
  const hostname = normalizeSitePattern(activeHostname);
  let disabledSites: string[];

  if (state === 'userBlocked') {
    // Remove every user pattern that blocks this host (exact or wildcard).
    disabledSites = settings.disabledSites.filter((site) => {
      const pattern = normalizeSitePattern(site);
      return pattern.startsWith('!') || !isHostnameBlocked(hostname, [pattern]);
    });
  } else if (state === 'safetyBlocked') {
    disabledSites = [...settings.disabledSites, `!${hostname}`];
  } else {
    disabledSites = [...settings.disabledSites, hostname];
  }

  await updatePublicSetting({ disabledSites: [...new Set(disabledSites)].sort((a, b) => a.localeCompare(b)) });
});

openOptionsButton.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void Promise.all([getPublicSettings(), getActiveTabUrl()]).then(([storedSettings, url]) => {
  settings = storedSettings;
  activeUrl = url;
  activeHostname = getHostnameFromUrl(url);
  renderState();
});
