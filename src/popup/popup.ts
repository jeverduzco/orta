import { getPublicSettings, setPublicSettings, type PublicOrtaSettings } from '../shared/settings';
import { getCopy } from '../shared/i18n';
import { normalizeAppLanguage } from '../shared/appLanguage';
import { getTargetLanguageLabel, normalizeTargetLanguage } from '../shared/languages';
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

const siteCard = getElement<HTMLElement>('.site-card');
const siteHost = getElement<HTMLElement>('#site-host');
const siteStatus = getElement<HTMLElement>('#site-status');
const toolsSection = getElement<HTMLElement>('.tools');
const correctMeta = getElement<HTMLElement>('#correct-meta');
const translateMeta = getElement<HTMLElement>('#translate-meta');
const shortcutsLine = getElement<HTMLElement>('#shortcuts');
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

let shortcuts: Partial<Record<'orta-correct' | 'orta-translate', string>> = {};

const renderShortcuts = (): void => {
  if (!settings) return;
  const copy = getCopy(settings.appLanguage);
  const items = [
    [copy.popupCorrect, shortcuts['orta-correct']],
    [copy.popupTranslate, shortcuts['orta-translate']],
  ].filter((item): item is [string, string] => !!item[1]);
  shortcutsLine.replaceChildren();
  shortcutsLine.hidden = items.length === 0;
  items.forEach(([label, keys], index) => {
    if (index > 0) shortcutsLine.append(' · ');
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    shortcutsLine.append(`${label} `, kbd);
  });
};

// Real shortcuts as the user configured them in chrome://extensions/shortcuts.
void chrome.commands?.getAll().then((commands) => {
  for (const command of commands) {
    if ((command.name === 'orta-correct' || command.name === 'orta-translate') && command.shortcut) {
      shortcuts[command.name] = command.shortcut;
    }
  }
  renderShortcuts();
});

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

  const statusText: Record<SiteState, string> = {
    unavailable: copy.popupNotAvailable,
    userBlocked: copy.popupStatusUserBlocked,
    safetyBlocked: copy.popupStatusSafety,
    protectedPage: copy.popupProtectedPage,
    active: copy.popupStatusActive,
  };
  siteCard.dataset.state = state;
  siteHost.textContent = state === 'unavailable' ? 'Orta' : activeHostname;
  siteStatus.textContent = statusText[state];

  siteToggleButton.textContent =
    state === 'userBlocked'
      ? copy.popupEnableHere
      : state === 'safetyBlocked'
        ? copy.builtinAllowButton
        : copy.popupDisableHere;
  siteToggleButton.hidden = state === 'unavailable';
  openOptionsButton.setAttribute('aria-label', copy.popupOpenSettings);
  openOptionsButton.title = copy.popupOpenSettings;

  const app = normalizeAppLanguage(settings.appLanguage);
  correctMeta.textContent = getTargetLanguageLabel(normalizeTargetLanguage(settings.correctionLanguage), app);
  translateMeta.textContent = `→ ${getTargetLanguageLabel(normalizeTargetLanguage(settings.targetLanguage), app)}`;
  toolsSection.dataset.disabled = String(!settings.enabled);

  const labels: Record<string, string> = {
    thisSite: copy.popupThisSite,
    tools: copy.toolsTitle,
    correct: copy.popupCorrect,
    translate: copy.popupTranslate,
    enabled: copy.popupEnabled,
    allSites: copy.popupAllSites,
  };
  document.querySelectorAll<HTMLElement>('[data-popup-label]').forEach((element) => {
    const text = labels[element.dataset.popupLabel ?? ''];
    if (text) element.textContent = text;
  });
  renderShortcuts();
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
