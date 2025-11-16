const normalizeCustomBase = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // If user already provided the full start.html path, trust it.
  if (/start\.html$/i.test(trimmed)) {
    return trimmed;
  }

  // If only /html was provided, just append start.html
  if (/\/html\/?$/i.test(trimmed)) {
    return `${trimmed.replace(/\/+$/, '')}/start.html`;
  }

  // Generic case: ensure trailing /html/start.html is appended once.
  return `${trimmed.replace(/\/+$/, '')}/html/start.html`;
};

export const resolveBlueLightStartUrl = () => {
  const customBase = normalizeCustomBase(process.env.REACT_APP_BLUELIGHT_BASE_URL);
  if (customBase) {
    return customBase;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.protocol}//${window.location.host}/bluelight/html/start.html`;
};
