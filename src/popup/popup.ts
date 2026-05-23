import { getPublicSettings, setPublicSettings, type PublicOrtaSettings } from '../shared/settings';
import { getCopy } from '../shared/i18n';
import { getHostnameFromUrl, isHostnameBlocked, normalizeSitePattern } from '../shared/sites';
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

const renderState = (): void => {
  if (!settings) {
    return;
  }

  const copy = getCopy(settings.appLanguage);
  const isSiteBlocked = activeHostname
    ? isHostnameBlocked(activeHostname, settings.disabledSites)
    : false;

  enabledInput.checked = settings.enabled;
  correctionInput.checked = settings.correctionEnabled;
  translationInput.checked = settings.translationEnabled;

  siteStatus.textContent = activeHostname
    ? `${isSiteBlocked ? copy.popupDisabledOn : copy.popupActiveOn} ${activeHostname}`
    : copy.popupNotAvailable;

  siteToggleButton.textContent = isSiteBlocked ? copy.popupEnableHere : copy.popupDisableHere;
  siteToggleButton.disabled = !activeHostname;
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

  const normalizedHostname = normalizeSitePattern(activeHostname);
  const isSiteBlocked = isHostnameBlocked(normalizedHostname, settings.disabledSites);
  const disabledSites = isSiteBlocked
    ? settings.disabledSites.filter((site) => normalizeSitePattern(site) !== normalizedHostname)
    : [...settings.disabledSites, normalizedHostname].sort((a, b) => a.localeCompare(b));

  await updatePublicSetting({ disabledSites });
});

openOptionsButton.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void Promise.all([getPublicSettings(), getActiveTabUrl()]).then(([storedSettings, url]) => {
  settings = storedSettings;
  activeHostname = getHostnameFromUrl(url);
  renderState();
});
