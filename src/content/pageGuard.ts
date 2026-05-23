// Per-page safety heuristics that complement domain-level filtering.
// The goal: hide Orta on auth-like or payment-like pages even when the
// user has not blacklisted the domain.

const AUTH_LIKE_PATH_PATTERNS = [
  /\/(sign[-_]?in|signin|log[-_]?in|login)(?=\/|$)/i,
  /\/(sign[-_]?up|signup|register|create[-_]?account)(?=\/|$)/i,
  /\/(reset[-_]?password|forgot[-_]?password|recover[-_]?password)(?=\/|$)/i,
  /\/(2fa|mfa|verify|verification|otp|one[-_]?time[-_]?code)(?=\/|$)/i,
  /\/(checkout|payment|payments|billing|invoice)(?=\/|$)/i,
  /\/(wallet|kyc)(?=\/|$)/i,
  /\/onboarding\/identity(?=\/|$)/i,
  /\/auth\/(2fa|mfa|verify|verification|otp)(?=\/|$)/i,
];

const isVisibleElement = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) {
    return false;
  }

  const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
  if (!style) {
    return true;
  }

  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
};

export const hasVisiblePasswordField = (root: ParentNode = document): boolean => {
  const candidates = root.querySelectorAll<HTMLInputElement>(
    'input[type="password"]:not([aria-hidden="true"])',
  );

  for (const candidate of Array.from(candidates)) {
    if (!candidate.disabled && isVisibleElement(candidate)) {
      return true;
    }
  }

  return false;
};

export const isAuthLikePath = (url: string): boolean => {
  let pathname = '';

  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  return AUTH_LIKE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
};

export const isPageSafeForOrta = (url: string, root: ParentNode = document): boolean => {
  if (isAuthLikePath(url)) {
    return false;
  }

  if (hasVisiblePasswordField(root)) {
    return false;
  }

  return true;
};
