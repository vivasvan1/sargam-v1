// Google Drive API service
// Uses Google Identity Services (new) instead of deprecated auth2
import { loadGapiInsideDOM } from "gapi-script";

const ROOT_FOLDER_NAME = "sargamNotes";
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

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
}

interface SaveFileResult {
  id: string;
  name: string;
  webViewLink?: string;
}

let gapi: any = null;
let isInitialized = false;
let isSignedIn = false;
let currentUser: GoogleUser | null = null;
let rootFolderId: string | null = null;
let accessToken: string | null = null;
let tokenClient: TokenClient | null = null;
let clientId: string | null = null;

// Wait for gapi to be available
function waitForGapi(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.gapi) {
      resolve(window.gapi);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50;
    const interval = setInterval(() => {
      attempts++;
      if (typeof window !== "undefined" && window.gapi) {
        clearInterval(interval);
        resolve(window.gapi);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error("Google API not loaded after timeout"));
      }
    }, 100);
  });
}

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
      await getUserInfo();
      isSignedIn = true;
    }

    return gapi;
  } catch (error: any) {
    console.error("Error initializing Google API:", error);
    throw new Error("Failed to initialize Google API: " + error.message);
  }
}

// Get user info from token
async function getUserInfo(): Promise<void> {
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
    }
  } catch (error) {
    console.error("Error getting user info:", error);
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
          await getUserInfo();

          tokenReceived = true;
          isSignedIn = true;
          resolve(currentUser!);
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
      q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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
      fields: "files(id, name, modifiedTime, mimeType)",
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
  if (!isInitialized || !gapi) {
    throw new Error("Google API not initialized");
  }

  try {
    // Get access token
    const token = accessToken || gapi.client.getToken()?.access_token;
    if (!token) {
      throw new Error("No access token available. Please authenticate first.");
    }

    // Fetch file content using REST API
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
    console.error("Error loading file:", error);
    throw new Error(error.message || "Failed to load file from Google Drive");
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
      fields: "id, name, modifiedTime, mimeType, parents",
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

