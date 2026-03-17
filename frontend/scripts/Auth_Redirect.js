(function commandCenterAuthRedirect() {
  const TOKEN_KEY = 'command_center_token';
  const LEGACY_TOKEN_KEY = 'mack_token';
  const PORTAL_KEY = 'command-center';
  const LAST_PORTAL_KEY = 'command_center_last_portal';
  const LEGACY_LAST_PORTAL_KEY = 'mack_last_portal';
  const LOGIN_URL = '/login.html';

  function readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (error) {
    }
  }

  function markPortalSession() {
    try {
      localStorage.setItem(LAST_PORTAL_KEY, PORTAL_KEY);
      localStorage.removeItem(LEGACY_LAST_PORTAL_KEY);
    } catch (error) {
    }
  }

  function redirectToLogin() {
    markPortalSession();
    window.location.href = LOGIN_URL;
  }

  function handleUnauthorized(responseStatus) {
    if (responseStatus === 401 || responseStatus === 403) {
      clearToken();
      redirectToLogin();
      return true;
    }
    return false;
  }

  window.CommandCenterAuth = {
    TOKEN_KEY,
    LEGACY_TOKEN_KEY,
    PORTAL_KEY,
    readToken,
    clearToken,
    markPortalSession,
    redirectToLogin,
    handleUnauthorized,
  };

  markPortalSession();
})();
