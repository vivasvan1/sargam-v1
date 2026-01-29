// Google Drive API service
// Uses Google Identity Services (new) instead of deprecated auth2
import { loadGapiInsideDOM } from "gapi-script";

const ROOT_FOLDER_NAME = "sargamNotes";
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];
const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

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
  console.log(file, file.permissions);
  if (!file.permissions) return false;
  return file.permissions.some(p => p.type === 'anyone' || p.type === 'domain');
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
      typeof window !== "undefined" &&
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
        typeof window !== "undefined" &&
        window.google &&
        window.google.accounts
      ) {
        clearInterval(interval);
        resolve(window.google);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error("Google Identity Services not loaded after timeout"));
      }
    }, 100);
  });
}

// Initialize Google API
export async function initializeGoogleAPI(providedClientId: string): Promise<any> {
  if (isInitialized && gapi) {
    return gapi;
  }

  if (!providedClientId) {
    throw new Error("Google Client ID is required");
  }

  clientId = providedClientId;

  try {
    // First, ensure gapi is available
    if (typeof window === "undefined") {
      throw new Error("Window is undefined");
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
          reject(new Error("Timeout loading Google API client library"));
        }, 15000);

        gapi.load("client", {
          callback: () => {
            clearTimeout(timeout);
            resolve();
          },
          onerror: (error: any) => {
            clearTimeout(timeout);
            reject(new Error("Failed to load Google API client: " + error));
          },
        });
      });
    }

    // Now initialize the client with discovery docs
    if (!gapi.client.init) {
      throw new Error("gapi.client.init is not available");
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

    isInitialized = true;

    // Check if we have a stored token
    const storedToken = sessionStorage.getItem("google_drive_token");
    if (storedToken) {
      accessToken = storedToken;
      gapi.client.setToken({ access_token: accessToken });
      const success = await getUserInfo();
      if (success) {
        isSignedIn = true;
      } else {
        // Token might be expired
        accessToken = null;
        sessionStorage.removeItem("google_drive_token");
        gapi.client.setToken(null);
        isSignedIn = false;
      }
    }

    return gapi;
  } catch (error: any) {
    console.error("Error initializing Google API:", error);
    throw new Error("Failed to initialize Google API: " + error.message);
  }
}

// Get user info from token
async function getUserInfo(): Promise<boolean> {
  if (!accessToken) return false;

  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
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
      return true;
    } else if (response.status === 401) {
      console.error("Google API token expired or invalid (401)");
      return false;
    }
    return false;
  } catch (error) {
    console.error("Error getting user info:", error);
    return false;
  }
}

// Authenticate user using Google Identity Services
export async function authenticate(): Promise<GoogleUser> {
  if (!isInitialized || !gapi || !tokenClient) {
    throw new Error(
      "Google API not initialized. Call initializeGoogleAPI first."
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
            if (
              tokenResponse.error === "popup_closed_by_user" ||
              tokenResponse.error === "access_denied"
            ) {
              reject(new Error("Sign-in cancelled"));
            } else {
              reject(
                new Error("Authentication failed: " + tokenResponse.error)
              );
            }
            return;
          }

          accessToken = tokenResponse.access_token!;
          sessionStorage.setItem("google_drive_token", accessToken);

          // Set the token for gapi client
          gapi.client.setToken({ access_token: accessToken });

          // Get user info
          const success = await getUserInfo();

          tokenReceived = true;
          if (success && currentUser) {
            isSignedIn = true;
            resolve(currentUser);
          } else {
            // Even if user info fails, we have the token, but for this app's UX
            // we prefer having the user identity.
            // If it fails right after auth, it's likely a scope issue.
            isSignedIn = true;
            const fallbackUser = { email: "Connected", name: "User" };
            currentUser = fallbackUser;
            resolve(fallbackUser);
          }
        },
      });

      // Request access token
      authTokenClient.requestAccessToken({ prompt: "consent" });

      // Timeout after 60 seconds
      setTimeout(() => {
        if (!tokenReceived) {
          reject(new Error("Authentication timeout"));
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
        console.log("Token revoked");
      });
    }

    // Clear gapi client token
    gapi.client.setToken(null);

    isSignedIn = false;
    currentUser = null;
    rootFolderId = null;
    accessToken = null;
    sessionStorage.removeItem("google_drive_token");
  } catch (error) {
    console.error("Error disconnecting:", error);
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
    throw new Error("Google API not initialized");
  }

  // First, try to find existing folder
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (response.result.files && response.result.files.length > 0) {
      rootFolderId = response.result.files[0].id;
      return rootFolderId;
    }
  } catch (error) {
    console.error("Error searching for root folder:", error);
  }

  // If not found, create it
  try {
    const fileMetadata = {
      name: ROOT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    };

    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: "id, name",
    });

    rootFolderId = response.result.id;
    return rootFolderId;
  } catch (error) {
    console.error("Error creating root folder:", error);
    throw new Error("Failed to create root folder");
  }
}

// Get or create subfolder
export async function getOrCreateSubfolder(subfolderName: string): Promise<string | null> {
  if (!subfolderName || subfolderName.trim() === "") {
    return null;
  }

  const rootId = await ensureRootFolder();
  const sanitized = sanitizeFolderName(subfolderName.trim());

  // Search for existing subfolder
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${sanitized}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id;
    }
  } catch (error) {
    console.error("Error searching for subfolder:", error);
  }

  // Create subfolder if not found
  try {
    const fileMetadata = {
      name: sanitized,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    };

    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: "id, name",
    });

    return response.result.id;
  } catch (error) {
    console.error("Error creating subfolder:", error);
    throw new Error(`Failed to create subfolder: ${sanitized}`);
  }
}

// List subfolders in root or a specific folder
export async function getSubfolders(subfolderName: string | null = null): Promise<GoogleFolder[]> {
  let parentId: string | null = null;

  if (subfolderName) {
    parentId = await getOrCreateSubfolder(subfolderName);
  } else {
    parentId = await ensureRootFolder();
  }

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name, modifiedTime)",
      spaces: "drive",
      orderBy: "name",
    });

    return response.result.files || [];
  } catch (error) {
    console.error("Error listing subfolders:", error);
    return [];
  }
}

// List .imnb files in a folder
export async function listFiles(folderId: string | null = null, subfolderName: string | null = null): Promise<GoogleFile[]> {
  let parentId: string | null = null;

  if (subfolderName) {
    parentId = await getOrCreateSubfolder(subfolderName);
  } else if (folderId) {
    parentId = folderId;
  } else {
    parentId = await ensureRootFolder();
  }

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${parentId}' in parents and name contains '.imnb' and trashed=false`,
      fields: "files(id, name, modifiedTime, mimeType, permissions)",
      spaces: "drive",
      orderBy: "modifiedTime desc",
    });

    return response.result.files || [];
  } catch (error) {
    console.error("Error listing files:", error);
    return [];
  }
}

// Save file to Google Drive
export async function saveFile(title: string, content: string, subfolderName: string | null = null): Promise<SaveFileResult> {
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  const rootId = await ensureRootFolder();
  const sanitizedTitle = sanitizeFileName(title);
  const fileName = sanitizedTitle.endsWith(".imnb")
    ? sanitizedTitle
    : `${sanitizedTitle}.imnb`;

  // Determine parent folder
  let parentId = rootId;
  if (subfolderName && subfolderName.trim() !== "") {
    parentId = await getOrCreateSubfolder(subfolderName.trim()) || rootId;
  }

  // Check if file already exists
  let existingFileId: string | null = null;
  try {
    const listResponse = await gapi.client.drive.files.list({
      q: `name='${fileName}' and '${parentId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });

    if (listResponse.result.files && listResponse.result.files.length > 0) {
      existingFileId = listResponse.result.files[0].id;
    }
  } catch (error) {
    console.error("Error checking for existing file:", error);
  }

  // Convert content to Blob
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], fileName, { type: "application/json" });

  const token = accessToken || gapi.client.getToken()?.access_token;
  if (!token) {
    throw new Error("No access token available. Please authenticate first.");
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
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      form.append("file", file);

      response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      );
    } else {
      // Create new file - include parents for new files
      const metadata = {
        name: fileName,
        parents: [parentId],
      };

      const form = new FormData();
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      form.append("file", file);

      response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      );
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to save file");
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
    };
  } catch (error: any) {
    console.error("Error saving file:", error);
    throw error;
  }
}

// Update file by ID (for auto-save)
export async function updateFileById(fileId: string, content: string): Promise<SaveFileResult> {
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  const token = accessToken || gapi.client.getToken()?.access_token;
  if (!token) {
    throw new Error("No access token available. Please authenticate first.");
  }

  try {
    // Get current file metadata to preserve name
    const metadataResponse = await gapi.client.drive.files.get({
      fileId: fileId,
      fields: "name",
    });
    const fileName = metadataResponse.result.name;

    // Convert content to Blob
    const blob = new Blob([content], { type: "application/json" });
    const file = new File([blob], fileName, { type: "application/json" });

    const metadata = {
      name: fileName,
      // Don't include parents for updates
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", file);

    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to update file");
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
    };
  } catch (error: any) {
    console.error("Error updating file:", error);
    throw error;
  }
}
// Load file from Google Drive
export async function loadFile(fileId: string): Promise<any> {
  // Try to get an authenticated token first
  const token = accessToken || (isInitialized && gapi?.client?.getToken()?.access_token);

  // If we have a token, use the standard authenticated request
  if (token) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: { message: "Failed to load file" } }));
        throw new Error(error.error?.message || "Failed to load file");
      }

      const content = await response.text();
      return JSON.parse(content);
    } catch (error: any) {
      console.error("Error loading file with auth:", error);
      // If auth fails for a potentially public file, we might want to fall back 
      // but usually if you have a token it should work or the file is private.
      throw new Error(error.message || "Failed to load file from Google Drive");
    }
  } else {
    // No token available. Try to load using API Key (for public files)
    // CHECKME: User must provide this key
    const API_KEY = "REDACTED_GOOGLE_API_KEY"; // TODO: Put your Google API Key here

    if (!API_KEY) {
      throw new Error("Sign in to Google Drive or provide an API Key to load this file.");
    }

    try {
      // Access public file via API Key
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // 403 usually means the file is not public or key is invalid
        if (response.status === 403 || response.status === 401) {
          throw new Error("File is not public or invalid API Key. Please sign in.");
        }
        throw new Error(error.error?.message || "Failed to load public file");
      }

      const content = await response.text();
      return JSON.parse(content);
    } catch (error: any) {
      console.error("Error loading public file:", error);
      throw new Error(error.message || "Failed to load public file");
    }
  }
}

// Delete file from Google Drive
export async function deleteFile(fileId: string): Promise<void> {
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  try {
    await gapi.client.drive.files.delete({
      fileId: fileId,
    });
  } catch (error: any) {
    console.error("Error deleting file:", error);
    throw new Error(error.result?.error?.message || error.message || "Failed to delete file from Google Drive");
  }
}

// Get file metadata
export async function getFileMetadata(fileId: string): Promise<GoogleFile> {
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  try {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      fields: "id, name, modifiedTime, mimeType, parents, permissions, capabilities",
    });

    return response.result;
  } catch (error) {
    console.error("Error getting file metadata:", error);
    throw error;
  }
}

// Sanitize filename
function sanitizeFileName(name: string): string {
  // Remove invalid characters and limit length
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/^\.+/, "")
      .replace(/\.+$/, "")
      .substring(0, 255)
      .trim() || "untitled"
  );
}

// Sanitize folder name
function sanitizeFolderName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/^\.+/, "")
      .replace(/\.+$/, "")
      .substring(0, 255)
      .trim() || "untitled"
  );
}

// --- Public Registry & Sharing Functions ---

// The URL of our deployed Google Apps Script Web App
// Using the one provided by the user
const REGISTRY_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxibtOQpGm010P_TMv98bfdprHBXqniqyC6MiFRy8Qe3VNwStwafrO6yYVmZlaSsR5E/exec";

// Make a file public (Anyone with link can view)
export async function setFilePublic(fileId: string): Promise<void> {
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  try {
    await gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        role: "reader",
        type: "anyone",
      },
    });
  } catch (error: any) {
    console.error("Error setting file public:", error);
    throw new Error("Failed to make file public: " + (error.result?.error?.message || error.message));
  }
}

export interface RegistryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  date: string;
}

// Publish to the registry (Apps Script)
export async function publishToRegistry(fileId: string, name: string, description: string = "", author: string = "Anonymous"): Promise<void> {
  // 1. Ensure file is public first
  await setFilePublic(fileId);

  // 2. Post to registry
  // We use mode: 'no-cors' which makes the response opaque.
  try {
    await fetch(REGISTRY_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        id: fileId,
        name: name,
        description: description,
        author: author,
      }),
    });
  } catch (error) {
    console.error("Error publishing to registry:", error);
    // throw new Error("Failed to publish to registry");
  }
}

// Fetch public files from registry with search and pagination
export async function fetchPublicRegistry(
  search: string = "",
  page: number = 1,
  pageSize: number = 10
): Promise<{ total: number; files: RegistryEntry[] }> {
  try {
    const url = new URL(REGISTRY_SCRIPT_URL);
    if (search) url.searchParams.append("q", search);
    if (page) url.searchParams.append("page", page.toString());
    if (pageSize) url.searchParams.append("pageSize", pageSize.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error("Failed to fetch registry");
    }
    const data = await response.json();
    return data as { total: number; files: RegistryEntry[] };
  } catch (error) {
    console.error("Error fetching registry:", error);
    return { total: 0, files: [] };
  }
}

