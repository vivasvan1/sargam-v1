// Google Drive API service
// Uses Google Identity Services (new) instead of deprecated auth2
import { loadGapiInsideDOM } from 'gapi-script';
import { useAuthStore } from '@/store/useAuthStore';

const ROOT_FOLDER_NAME = 'sargamNotes';
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
];
const SCOPES =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

// The URL of our deployed Google Apps Script Web App
const REGISTRY_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzAYl69gVoft_Qvlblqx9rOKO5DTOm3TIHVm6roCmtfEKJiKnRIA0SeN-9AFg295n0w/exec';


// Type declarations for Google API
declare global {
  interface Window {
    gapi?: any;
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback?: (response: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

export interface GoogleUser {
  email: string;
  name: string;
}

export interface GoogleFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface GoogleFile {
  id: string;
  name: string;
  modifiedTime?: string;
  mimeType?: string;
  parents?: string[];
  permissions?: { type: string; role: string; emailAddress?: string }[];
  capabilities?: { canEdit: boolean };
}

interface SaveFileResult {
  id: string;
  name: string;
  webViewLink?: string;
}

// Helper to check if a file is public
export function checkIfPublic(file: GoogleFile): boolean {
  if (!file.permissions) return false;
  return file.permissions.some(
    (p) => p.type === 'anyone' || p.type === 'domain'
  );
}

// Helper to check if a file is editable
export function checkIfEditable(file: GoogleFile): boolean {
  return file.capabilities?.canEdit ?? true; // Default to true if unknown, to be safe, or false? authenticating usually gives capabilities.
}

// Helper to generate shareable link
export function getShareableLink(fileId: string): string {
  const origin = window.location.origin;
  return `${origin}?fileId=${fileId}`;
}

let gapi: any = null;
let isInitialized = false;
let initializationPromise: Promise<any> | null = null;
let isSignedIn = false;
let currentUser: GoogleUser | null = null;
let rootFolderId: string | null = null;
let accessToken: string | null = null;
let tokenClient: TokenClient | null = null;
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
      discoveryDocs: DISCOVERY_DOCS,
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
        callback: async (tokenResponse: TokenResponse) => {
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
          localStorage.setItem('google_drive_token', accessToken);
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
    // If we fail here, we might still be 'signed in' with a token but can't get info.
    // However, if token is invalid, we should probably reset store or rely on existing logic.
    // The existing logic returns false, so caller handles it.
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

export function getGoogleOAuthUrl(fallbackClientId?: string): string {
  const effectiveClientId = clientId || fallbackClientId;

  if (!effectiveClientId) {
    throw new Error('Google Client ID is required');
  }

  const params = new URLSearchParams({
    client_id: effectiveClientId,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    prompt: 'consent',
  });

  if (currentUser?.email) {
    params.set('login_hint', currentUser.email);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function openGoogleLoginInNewTab(fallbackClientId?: string): void {
  const popup = window.open(
    getGoogleOAuthUrl(fallbackClientId),
    '_blank',
    'noopener,noreferrer'
  );
  if (!popup) {
    throw new Error('Popup blocked. Please allow popups or open login manually.');
  }
}

export function clearGoogleAuthCache(): void {
  accessToken = null;
  currentUser = null;
  rootFolderId = null;
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
        callback: async (tokenResponse: TokenResponse) => {
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
          localStorage.setItem('google_drive_token', accessToken);

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
    rootFolderId = null;
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

// Ensure root folder exists, return its ID
export async function ensureRootFolder(): Promise<string | null> {
  if (rootFolderId) {
    return rootFolderId;
  }

  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  // First, try to find existing folder
  try {
    const response: any = await withRetry(() => gapi.client.drive.files.list({
      q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    }));

    if (response.result.files && response.result.files.length > 0) {
      rootFolderId = response.result.files[0].id;
      return rootFolderId;
    }
  } catch (error) {
    console.error('Error searching for root folder:', error);
  }

  // If not found, create it
  try {
    const fileMetadata = {
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    };

    const response: any = await withRetry(() => gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id, name',
    }));

    rootFolderId = response.result.id;
    return rootFolderId;
  } catch (error) {
    console.error('Error creating root folder:', error);
    throw new Error('Failed to create root folder');
  }
}

// Get or create subfolder
export async function getOrCreateSubfolder(
  subfolderName: string
): Promise<string | null> {
  if (!subfolderName || subfolderName.trim() === '') {
    return null;
  }

  const rootId = await ensureRootFolder();
  const sanitized = sanitizeFolderName(subfolderName.trim());

  // Search for existing subfolder
  try {
    const response: any = await withRetry(() => gapi.client.drive.files.list({
      q: `name='${sanitized}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    }));

    if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id;
    }
  } catch (error) {
    console.error('Error searching for subfolder:', error);
  }

  // Create subfolder if not found
  try {
    const fileMetadata = {
      name: sanitized,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    };

    const response: any = await withRetry(() => gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id, name',
    }));

    return response.result.id;
  } catch (error) {
    console.error('Error creating subfolder:', error);
    throw new Error(`Failed to create subfolder: ${sanitized}`);
  }
}

// List subfolders in root or a specific folder
export async function getSubfolders(
  subfolderName: string | null = null
): Promise<GoogleFolder[]> {
  let parentId: string | null = null;

  if (subfolderName) {
    parentId = await getOrCreateSubfolder(subfolderName);
  } else {
    parentId = await ensureRootFolder();
  }

  try {
    const response: any = await withRetry(() => gapi.client.drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive',
      orderBy: 'name',
    }));

    return response.result.files || [];
  } catch (error) {
    console.error('Error listing subfolders:', error);
    return [];
  }
}

// List .imnb files in a folder
export async function listFiles(
  folderId: string | null = null,
  subfolderName: string | null = null
): Promise<GoogleFile[]> {
  let parentId: string | null = null;

  if (subfolderName) {
    parentId = await getOrCreateSubfolder(subfolderName);
  } else if (folderId) {
    parentId = folderId;
  } else {
    parentId = await ensureRootFolder();
  }

  try {
    const response: any = await withRetry(() => gapi.client.drive.files.list({
      q: `'${parentId}' in parents and name contains '.imnb' and trashed=false`,
      fields: 'files(id, name, modifiedTime, mimeType, permissions)',
      spaces: 'drive',
      orderBy: 'modifiedTime desc',
    }));

    return response.result.files || [];
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

// Save file to Google Drive
export async function saveFile(
  title: string,
  content: string,
  subfolderName: string | null = null
): Promise<SaveFileResult> {
  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  const rootId = await ensureRootFolder();
  const sanitizedTitle = sanitizeFileName(title);
  const fileName = sanitizedTitle.endsWith('.imnb')
    ? sanitizedTitle
    : `${sanitizedTitle}.imnb`;

  // Determine parent folder
  let parentId = rootId;
  if (subfolderName && subfolderName.trim() !== '') {
    parentId = (await getOrCreateSubfolder(subfolderName.trim())) || rootId;
  }

  // Check if file already exists
  let existingFileId: string | null = null;
  try {
    const listResponse: any = await withRetry(() => gapi.client.drive.files.list({
      q: `name='${fileName}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    }));

    if (listResponse.result.files && listResponse.result.files.length > 0) {
      existingFileId = listResponse.result.files[0].id;
    }
  } catch (error) {
    console.error('Error checking for existing file:', error);
  }

  // Convert content to Blob
  const blob = new Blob([content], { type: 'application/json' });
  const file = new File([blob], fileName, { type: 'application/json' });

  const token = accessToken || gapi.client.getToken()?.access_token;
  if (!token) {
    throw new Error('No access token available. Please authenticate first.');
  }

  try {
    let response: Response;
    if (existingFileId) {
      // Update existing file - don't include parents in metadata for updates
      const metadata = {
        name: fileName,
        // Note: parents field is not writable in update requests
        // If we need to move the file, we'd use addParents/removeParents
      };

      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      form.append('file', file);

      const doFetch = async () => {
        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken || gapi.client.getToken()?.access_token}`,
            },
            body: form,
          }
        );
        if (!res.ok) {
          const err: any = new Error('Failed to update file');
          err.status = res.status;
          try {
            err.result = await res.json();
          } catch (e) {}
          throw err;
        }
        return res;
      };
      response = await withRetry(doFetch);
    } else {
      // Create new file - include parents for new files
      const metadata = {
        name: fileName,
        parents: [parentId],
      };

      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      form.append('file', file);

      const doFetch = async () => {
        const res = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken || gapi.client.getToken()?.access_token}`,
            },
            body: form,
          }
        );
        if (!res.ok) {
          const err: any = new Error('Failed to create file');
          err.status = res.status;
          try {
            err.result = await res.json();
          } catch (e) {}
          throw err;
        }
        return res;
      };
      response = await withRetry(doFetch);
    }


    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google Drive session expired. Please reconnect.');
      }
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to save file');
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
    };
  } catch (error: any) {
    console.error('Error saving file:', error);
    throw error;
  }
}

// Update file by ID (for auto-save)
export async function updateFileById(
  fileId: string,
  content: string
): Promise<SaveFileResult> {
  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  const token = accessToken || gapi.client.getToken()?.access_token;
  if (!token) {
    throw new Error('No access token available. Please authenticate first.');
  }

  try {
    // Get current file metadata to preserve name
    const metadataResponse: any = await withRetry(() => gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'name',
    }));
    const fileName = metadataResponse.result.name;

    // Convert content to Blob
    const blob = new Blob([content], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    const metadata = {
      name: fileName,
      // Don't include parents for updates
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', file);

    const doFetch = async () => {
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken || gapi.client.getToken()?.access_token}`,
          },
          body: form,
        }
      );
      if (!res.ok) {
        const err: any = new Error('Failed to update file');
        err.status = res.status;
        try {
          err.result = await res.json();
        } catch (e) {}
        throw err;
      }
      return res;
    };
    const response = await withRetry(doFetch);


    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google Drive session expired. Please reconnect.');
      }
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to update file');
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
    };
  } catch (error: any) {
    console.error('Error updating file:', error);
    throw error;
  }
}

// Load file from Google Drive
async function loadFile(fileId: string): Promise<any> {
  return withRetry(async () => {
    const token =
      accessToken || (isInitialized && gapi?.client?.getToken()?.access_token);

    if (!token) {
      throw {
        status: 401,
        message: 'No access token available. Please sign in with Google.',
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: { message: 'Failed to load file' } }));
      const error: any = new Error(
        errorData.error?.message || 'Failed to load file'
      );
      error.status = response.status;
      throw error;
    }

    const content = await response.text();
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error('Error parsing file content:', content.substring(0, 100));
      throw new Error('Failed to parse file content from Google Drive');
    }
  });
}


// Load notebook and its metadata (permissions, publish status) in parallel
export async function loadNotebookAndMetadata(fileId: string): Promise<{
  notebook: any;
  metadata: GoogleFile | null;
  isPublished: boolean;
  isReadOnly: boolean;
}> {
  return withRetry(async () => {
    await waitForAuthReady();

    const notebookPromise = loadFile(fileId);
    const metadataPromise = isAuthenticated()
      ? getFileMetadata(fileId)
      : Promise.resolve(null);
    const publishedPromise = checkIsPublished(fileId);
    const [notebook, metadata, isPublished] = await Promise.all([
      notebookPromise,
      metadataPromise,
      publishedPromise,
    ]);

    return {
      notebook,
      metadata,
      isPublished,
      isReadOnly: metadata ? !checkIfEditable(metadata) : true,
    };
  });
}


// Delete file from Google Drive
export async function deleteFile(fileId: string): Promise<void> {
  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  try {
    await withRetry(() =>
      gapi.client.drive.files.delete({
        fileId: fileId,
      })
    );
  } catch (error: any) {
    console.error('Error deleting file:', error);
    throw new Error(
      error.result?.error?.message ||
        error.message ||
        'Failed to delete file from Google Drive'
    );
  }
}


// Get file metadata
export async function getFileMetadata(fileId: string): Promise<GoogleFile> {
  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  try {
    const response: any = await withRetry(() =>
      gapi.client.drive.files.get({
        fileId: fileId,
        fields:
          'id, name, modifiedTime, mimeType, parents, permissions, capabilities',
      })
    );

    return response.result;
  } catch (error: any) {
    if (
      error?.status === 404 ||
      error?.result?.error?.code === 404 ||
      (error?.result?.error?.message &&
        error.result.error.message.includes('File not found'))
    ) {
      console.warn(
        'File not found (404), returning minimal metadata for:',
        fileId
      );
      return {
        id: fileId,
        name: 'Unknown File',
        permissions: [],
        capabilities: { canEdit: false },
      } as GoogleFile;
    }
    console.error('Error getting file metadata:', error);
    throw error;
  }
}


// Sanitize filename
function sanitizeFileName(name: string): string {
  // Remove invalid characters and limit length
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .substring(0, 255)
      .trim() || 'untitled'
  );
}

// Sanitize folder name
function sanitizeFolderName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .substring(0, 255)
      .trim() || 'untitled'
  );
}

// --- Public Registry & Sharing Functions ---

// Make a file public (Anyone with link can view)
export async function setFilePublic(fileId: string): Promise<void> {
  if (!isInitialized || !gapi) {
    throw new Error('Google API not initialized');
  }

  try {
    await withRetry(() =>
      gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: {
          role: 'reader',
          type: 'anyone',
        },
      })
    );
  } catch (error: any) {
    console.error('Error setting file public:', error);
    throw new Error(
      'Failed to make file public: ' +
        (error.result?.error?.message || error.message)
    );
  }
}


export interface RegistryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  date: string;
  ownerEmail?: string;
}

export interface RegistryNotebookResult {
  notebook: any;
  entry: RegistryEntry;
}

// Publish to the registry (Apps Script)
export async function publishToRegistry(
  fileId: string,
  name: string,
  description: string = '',
  author: string = 'Anonymous',
  notebook?: any,
  ownerEmail: string = ''
): Promise<void> {
  // We use mode: 'no-cors' because Apps Script web apps do not always return
  // browser-friendly CORS headers for simple deployments.
  try {
    await fetch(REGISTRY_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        id: fileId,
        name: name,
        description: description,
        author: author,
        ownerEmail,
        content: notebook ? JSON.stringify(notebook) : undefined,
      }),
    });
  } catch (error) {
    console.error('Error publishing to registry:', error);
    // throw new Error("Failed to publish to registry");
  }
}

// Unpublish from the registry (Apps Script)
export async function unpublishFromRegistry(fileId: string): Promise<void> {
  try {
    await fetch(REGISTRY_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        id: fileId,
        action: 'unpublish',
      }),
    });
  } catch (error) {
    console.error('Error unpublishing from registry:', error);
  }
}

// Check if a file is published in the registry
export async function checkIsPublished(fileId: string): Promise<boolean> {
  try {
    const url = new URL(REGISTRY_SCRIPT_URL);
    url.searchParams.append('q', fileId); // Search by ID

    const response = await fetch(url.toString());
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    // Check if any file in the results matches our ID exactly
    return data.files.some((file: RegistryEntry) => file.id === fileId);
  } catch (error) {
    console.error('Error checking published status:', error);
    return false;
  }
}

// Load a public/community notebook directly from the registry snapshot.
export async function loadRegistryNotebook(
  fileId: string
): Promise<RegistryNotebookResult> {
  const url = new URL(REGISTRY_SCRIPT_URL);
  url.searchParams.append('action', 'open');
  url.searchParams.append('id', fileId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('This notebook is not published or is no longer available.');
  }

  const data = await response.json();
  if (data.status === 'not_found' || !data.notebook) {
    throw new Error('This notebook is not published or is no longer available.');
  }

  return {
    notebook: data.notebook,
    entry: data.entry,
  };
}

// Fetch public files from registry with search and pagination
export async function fetchPublicRegistry(
  search: string = '',
  page: number = 1,
  pageSize: number = 10
): Promise<{ total: number; files: RegistryEntry[] }> {
  try {
    const url = new URL(REGISTRY_SCRIPT_URL);
    if (search) url.searchParams.append('q', search);
    if (page) url.searchParams.append('page', page.toString());
    if (pageSize) url.searchParams.append('pageSize', pageSize.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('Failed to fetch registry');
    }
    const data = await response.json();
    return data as { total: number; files: RegistryEntry[] };
  } catch (error) {
    console.error('Error fetching registry:', error);
    return { total: 0, files: [] };
  }
}
