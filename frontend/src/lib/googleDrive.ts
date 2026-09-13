// Google Drive API service
// Uses Google Identity Services (new) instead of deprecated auth2
import {
  getGapiClient,
  getAccessToken,
  isAuthenticated,
  waitForAuthReady,
  withRetry,
} from './googleAuth';

const ROOT_FOLDER_NAME = 'sargamNotes';
// The URL of our deployed Google Apps Script Web App
const REGISTRY_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwCoJsK1v5HDQI1CTz2QS514SDIJ8edxBsYfyYgXSYwqgHPAw7HCeoYpkwQLfApUbOi/exec';

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

let rootFolderId: string | null = null;

// Ensure root folder exists, return its ID
export async function ensureRootFolder(): Promise<string | null> {
  if (rootFolderId) {
    return rootFolderId;
  }

  const gapi = getGapiClient();
  if (!gapi) {
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
    const gapi = getGapiClient();
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
    const gapi = getGapiClient();
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
    const gapi = getGapiClient();
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
    const gapi = getGapiClient();
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
  const gapi = getGapiClient();
  if (!gapi) {
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

  const token = getAccessToken() || gapi.client.getToken()?.access_token;
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
              Authorization: `Bearer ${getAccessToken() || gapi.client.getToken()?.access_token}`,
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
              Authorization: `Bearer ${getAccessToken() || gapi.client.getToken()?.access_token}`,
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
  const gapi = getGapiClient();
  if (!gapi) {
    throw new Error('Google API not initialized');
  }

  const token = getAccessToken() || gapi.client.getToken()?.access_token;
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
            Authorization: `Bearer ${getAccessToken() || gapi.client.getToken()?.access_token}`,
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
      getAccessToken() || (getGapiClient()?.client?.getToken()?.access_token);

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
  const gapi = getGapiClient();
  if (!gapi) {
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
  const gapi = getGapiClient();
  if (!gapi) {
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
  const gapi = getGapiClient();
  if (!gapi) {
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