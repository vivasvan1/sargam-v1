// Google Auth API service
// Uses Google Identity Services (new) instead of deprecated auth2
import { loadGapiInsideDOM } from 'gapi-script';
import { useAuthStore } from '@/store/useAuthStore';
const SCOPES = 'https://www.googleapis.com/auth/drive.file email profile';

// Type declarations for Google API (gapi client)
declare global {
  interface Window {
    gapi?: any;
  }
}

export interface GoogleUser {
  email: string;
  name: string;
}

let gapi: any = null;
let isInitialized = false;
let initializationPromise: Promise<any> | null = null;
let isSignedIn = false;
let currentUser: GoogleUser | null = null;
let accessToken: string | null = null;
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let clientId: string | null = null;

// Wait for Google Identity Services to load
function waitForGoogleIdentityServices(): Promise<typeof window.google> {
  return new Promise((resolve, reject) => {
    if (
      typeof window !== 'undefined' &&
      window.google &&
      window.google.accounts
    ) {
      resolve(window.google);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50;
    const interval = setInterval(() => {
      attempts++;
      if (
        typeof window !== 'undefined' &&
        window.google &&
        window.google.accounts
      ) {
        clearInterval(interval);
        resolve(window.google);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error('Google Identity Services not loaded after timeout'));
      }
    }, 100);
  });
}

// Wait for Auth to be initialized (resolved to either signed in or not)
export function waitForAuthReady(): Promise<boolean> {
  return new Promise((resolve) => {
    if (isInitialized) {
      resolve(true);
      return;
    }

    // Check every 100ms
    const interval = setInterval(() => {
      if (isInitialized) {
        clearInterval(interval);
        resolve(true);
      }
    }, 100);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!isInitialized) {
        clearInterval(interval);
        console.warn('waitForAuthReady timed out, proceeding anyway.');
        resolve(false);
      }
    }, 30000);
  });
}

// Initialize Google API
export async function initializeGoogleAPI(
  providedClientId: string
): Promise<any> {
  if (isInitialized && gapi) {
    return gapi;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  if (!providedClientId) {
    throw new Error('Google Client ID is required');
  }

  clientId = providedClientId;

  initializationPromise = (async () => {
    try {
      // First, ensure gapi is available
      if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
      }

      // Wait for Google Identity Services
      await waitForGoogleIdentityServices();

      // Use gapi-script to load gapi if not already available
      if (!window.gapi) {
        gapi = await loadGapiInsideDOM();
      } else {
        gapi = window.gapi;
      }

      // Ensure gapi.client is loaded - this is critical
      if (!gapi.client) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout loading Google API client library'));
          }, 15000);

          gapi.load('client', {
            callback: () => {
              clearTimeout(timeout);
              resolve();
            },
            onerror: (error: any) => {
              clearTimeout(timeout);
              reject(new Error('Failed to load Google API client: ' + error));
            },
          });
        });
      }

      // Now initialize the client with discovery docs
      if (!gapi.client.init) {
        throw new Error('gapi.client.init is not available');
      }

      await gapi.client.init({
        discoveryDocs: [
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
        ],
      });


      // Initialize Google Identity Services token client
      // Note: callback will be set when authenticate() is called
      tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {
          // This will be overridden in authenticate()
        },
      });

      // If we returned from the fallback OAuth tab flow, consume the token first.
      const consumedRedirectToken = await handleOAuthRedirectIfPresent();

      // Check if we have a stored token and user
      const storedToken = consumedRedirectToken
        ? null
        : localStorage.getItem('google_drive_token');
      const storedUserStr = localStorage.getItem('google_drive_user');

      if (storedToken) {
        accessToken = storedToken;
        gapi.client.setToken({ access_token: accessToken });

        if (storedUserStr) {
          try {
            currentUser = JSON.parse(storedUserStr);
            useAuthStore.getState().setUser(currentUser);
          } catch (e) {
            // Ignore parsing error
          }
        }

        // Validate the stored token before marking the app authenticated.
        // If it expired, try a silent Google Identity Services refresh first so
        // shared-file loading doesn't start with a stale token and hit a 401.
        const success = await getUserInfo();
        if (success) {
          isSignedIn = true;
          useAuthStore.getState().setAuthenticated(true);
        } else {
          const refreshed = await refreshTokenSilently();
          if (refreshed) {
            isSignedIn = true;
            useAuthStore.getState().setAuthenticated(true);
          } else {
            accessToken = null;
            isSignedIn = false;
            localStorage.removeItem('google_drive_token');
            gapi.client.setToken(null);
            useAuthStore.getState().setAuthenticated(false);
          }
        }
      }

      isInitialized = true;
      useAuthStore.getState().setInitialized(true);

      return gapi;
    } catch (error: any) {
      console.error('Error initializing Google API:', error);
      initializationPromise = null; // Clear promise on failure to allow retry
      throw new Error('Failed to initialize Google API: ' + error.message);
    }
  })();

  return initializationPromise;
}

// Silently refresh the Google Drive token using user consent we already have
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function refreshTokenSilently(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  if (!clientId || !window.google) {
    console.error('Cannot refresh token silently: Google API not initialized');
    return false;
  }

  isRefreshing = true;
  refreshPromise = new Promise((resolve) => {
    const finish = (success: boolean) => {
      isRefreshing = false;
      refreshPromise = null;
      resolve(success);
    };

    try {
      const config: any = {
        client_id: clientId!,
        scope: SCOPES,
        callback: async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
          if (tokenResponse.error) {
            console.error('Silent refresh failed:', tokenResponse.error);
            // If silent refresh completely fails, user needs explicit connect
            localStorage.removeItem('google_drive_token');
            useAuthStore.getState().setAuthenticated(false);
            isSignedIn = false;
            finish(false);
            return;
          }

          accessToken = tokenResponse.access_token!;
          localStorage.setItem('google_drive_token', accessToken??"");
          gapi.client.setToken({ access_token: accessToken });

          const success = await getUserInfo();
          if (success) {
            isSignedIn = true;
          }
          finish(success);
        },
      };

      if (currentUser?.email) {
        config.login_hint = currentUser.email;
      }

      const silentTokenClient = window.google!.accounts.oauth2.initTokenClient(config);

      // Request token without consent prompt for silent refresh
      silentTokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
      console.error('Silent refresh error:', error);
      finish(false);
    }
  });

  return refreshPromise;
}

// Helper wrapper to catch 401s and automatically trigger silent refresh
export async function withRetry<T>(apiCall: () => Promise<T>): Promise<T> {
  try {
    return await apiCall();
  } catch (error: any) {
    // Check if error is 401 Unauthorized via fetch response status, gapi client error,
    // or specific error messages that indicate we need a token refresh
    const isUnauthorized =
      error.status === 401 ||
      (error.result && error.result.error && error.result.error.code === 401) ||
      error.message?.includes('No access token available') ||
      error.message?.includes('sign in with Google') ||
      error.message?.includes('session expired') ||
      error.message?.includes('Please reconnect');

    if (isUnauthorized) {
      console.log('Authorization required or token expired, attempting silent refresh...');
      const refreshed = await refreshTokenSilently();
      if (refreshed) {
        console.log('Token refreshed successfully, retrying request...');
        return await apiCall(); // Retry the original call with new token!
      } else {
        // If silent refresh fails, we must finally throw to let the user know
        throw new Error('Google Drive session expired. Please reconnect.');
      }
    }
    throw error;
  }
}

// Get user info from token
async function getUserInfo(): Promise<boolean> {
  if (!accessToken) return false;

  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      const userInfo = await response.json();
      currentUser = {
        email: userInfo.email,
        name: userInfo.name,
      };
      // Update global store
      useAuthStore.getState().setAuthenticated(true);
      useAuthStore.getState().setUser(currentUser);
      return true;
    } else if (response.status === 401) {
      console.error('Google API token expired or invalid (401)');
      return false;
    }
    return false;
  } catch (error) {
    console.error('Error getting user info:', error);
    return false;
  }
}

function isPopupBlockedError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('popup') &&
    (message.includes('block') ||
      message.includes('failed') ||
      message.includes('open'))
  );
}

export function clearGoogleAuthCache(): void {
  accessToken = null;
  currentUser = null;
  isSignedIn = false;

  try {
    gapi?.client?.setToken(null);
  } catch (error) {
    console.warn('Could not clear Google API token:', error);
  }

  localStorage.removeItem('google_drive_token');
  localStorage.removeItem('google_drive_user');
  useAuthStore.getState().setAuthenticated(false);
  useAuthStore.getState().setUser(null);
}

export async function handleOAuthRedirectIfPresent(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('access_token');
  if (!token) return false;

  accessToken = token;
  localStorage.setItem('google_drive_token', accessToken);
  gapi?.client?.setToken({ access_token: accessToken });

  const success = await getUserInfo();
  if (success && currentUser) {
    isSignedIn = true;
    localStorage.setItem('google_drive_user', JSON.stringify(currentUser));
    useAuthStore.getState().setAuthenticated(true);
    useAuthStore.getState().setUser(currentUser);
  }

  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  return success;
}

export async function adoptStoredGoogleToken(): Promise<boolean> {
  const storedToken = localStorage.getItem('google_drive_token');
  if (!storedToken || !isInitialized || !gapi) return false;

  accessToken = storedToken;
  gapi.client.setToken({ access_token: accessToken });
  const success = await getUserInfo();
  if (success && currentUser) {
    isSignedIn = true;
    localStorage.setItem('google_drive_user', JSON.stringify(currentUser));
    useAuthStore.getState().setAuthenticated(true);
    useAuthStore.getState().setUser(currentUser);
  }
  return success;
}

// Authenticate user using Google Identity Services
export async function authenticate(): Promise<GoogleUser> {
  if (!isInitialized || !gapi || !tokenClient) {
    throw new Error(
      'Google API not initialized. Call initializeGoogleAPI first.'
    );
  }

  return new Promise((resolve, reject) => {
    try {
      let tokenReceived = false;

      // Create a new token client with our callback
      const authTokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId!,
        scope: SCOPES,
        include_granted_scopes: false,
        callback: async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
          if (tokenResponse.error) {
            tokenReceived = true;
            if (tokenResponse.error === 'popup_failed_to_open') {
              reject(new Error('Google sign-in popup was blocked.'));
            } else if (
              tokenResponse.error === 'popup_closed_by_user' ||
              tokenResponse.error === 'access_denied'
            ) {
              reject(new Error('Sign-in cancelled'));
            } else {
              reject(
                new Error('Authentication failed: ' + tokenResponse.error)
              );
            }
            return;
          }

          accessToken = tokenResponse.access_token!;
          localStorage.setItem('google_drive_token', accessToken??"");

          // Set the token for gapi client
          gapi.client.setToken({ access_token: accessToken });

          // Get user info
          const success = await getUserInfo();

          tokenReceived = true;
          if (success && currentUser) {
            isSignedIn = true;
            localStorage.setItem('google_drive_user', JSON.stringify(currentUser));
            resolve(currentUser);
          } else {
            // Even if user info fails, we have the token, but for this app's UX
            // we prefer having the user identity.
            // If it fails right after auth, it's likely a scope issue.
            isSignedIn = true;
            const fallbackUser = { email: 'Connected', name: 'User' };
            currentUser = fallbackUser;
            localStorage.setItem('google_drive_user', JSON.stringify(fallbackUser));
            // Update global store
            useAuthStore.getState().setAuthenticated(true);
            useAuthStore.getState().setUser(fallbackUser);
            resolve(fallbackUser);
          }
        },
      });

      // Request access token
      try {
        authTokenClient.requestAccessToken();
      } catch (error: any) {
        tokenReceived = true;
        if (isPopupBlockedError(error)) {
          reject(new Error('Google sign-in popup was blocked.'));
        } else {
          reject(error);
        }
      }

      // Timeout after 60 seconds
      setTimeout(() => {
        if (!tokenReceived) {
          reject(new Error('Authentication timeout'));
        }
      }, 60000);
    } catch (error) {
      reject(error);
    }
  });
}

// Disconnect user
export async function disconnect(): Promise<void> {
  if (!isInitialized || !gapi) {
    return;
  }

  try {
    // Revoke the token
    if (accessToken && window.google && window.google.accounts) {
      window.google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Token revoked');
      });
    }

    // Clear gapi client token
    gapi.client.setToken(null);

    isSignedIn = false;
    currentUser = null;
    accessToken = null;
    localStorage.removeItem('google_drive_token');
    localStorage.removeItem('google_drive_user');

    // Update global store
    useAuthStore.getState().setAuthenticated(false);
    useAuthStore.getState().setUser(null);
  } catch (error) {
    console.error('Error disconnecting:', error);
  }
}

// Get current user
export function getCurrentUser(): GoogleUser | null {
  return currentUser;
}

// Check if signed in
export function isAuthenticated(): boolean {
  return isSignedIn;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getGapiClient(): any {
  return gapi;
}
