export const REGISTRY_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwCoJsK1v5HDQI1CTz2QS514SDIJ8edxBsYfyYgXSYwqgHPAw7HCeoYpkwQLfApUbOi/exec';

export interface ExtractedMeta {
  title: string;
  author: string;
  raag: string;
  thaat: string;
  vadi: string;
  samvadi: string;
  time: string;
  tala: string;
  sa: string;
  cellTitle: string;
  noteLines: string[];
  description: string;
}

export async function fetchNotebookFromRegistry(fileId: string): Promise<any> {
  const url = `${REGISTRY_SCRIPT_URL}?action=open&id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch notebook registry: ${response.status}`);
  }
  const data = await response.json();
  if (data.status === 'not_found' || !data.notebook) {
    throw new Error('Notebook not found in registry');
  }
  return data;
}

export function extractNotebookMeta(notebook: any, entry: any = {}): ExtractedMeta {
  const cells: any[] = notebook?.cells || [];
  const nbMetadata = notebook?.metadata || {};

  const title = (entry?.name || nbMetadata?.title || 'Indian Classical Music Notebook').trim();
  const author = (entry?.author || nbMetadata?.author || '').trim();

  // 1. Extract Raag Name
  let raag = '';
  // Check markdown headings
  for (const c of cells) {
    const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
    const match = text.match(/#\s*(Raag\s+[A-Za-z]+(?:\s+[A-Za-z]+)?|[A-Za-z]+(?:\s+[A-Za-z]+)?\s+Raag)/i);
    if (match) {
      raag = match[1].trim();
      break;
    }
  }
  // Check @raga directive in music cells
  if (!raag) {
    for (const c of cells) {
      if (c.cell_type === 'music') {
        const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
        const match = text.match(/@raga\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
        if (match) {
          raag = `Raag ${match[1].trim()}`;
          break;
        }
      }
    }
  }
  // Check title
  if (!raag && title) {
    const match = title.match(/Raag\s+[A-Za-z]+(?:\s+[A-Za-z]+)?/i);
    if (match) {
      raag = match[0].trim();
    }
  }

  // 2. Extract Classical Attributes (Thaat, Vadi, Samvadi, Time)
  let thaat = '';
  let vadi = '';
  let samvadi = '';
  let time = '';

  for (const c of cells) {
    if (c.cell_type === 'markdown') {
      const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
      const thaatMatch = text.match(/\*\*Thaat:\*\*\s*([^\n\r*]+)/i);
      const vadiMatch = text.match(/\*\*Vadi:\*\*\s*([^\n\r*]+)/i);
      const samvadiMatch = text.match(/\*\*Samvadi:\*\*\s*([^\n\r*]+)/i);
      const timeMatch = text.match(/\*\*Time:\*\*\s*([^\n\r*]+)/i);

      if (thaatMatch && !thaat) thaat = thaatMatch[1].trim();
      if (vadiMatch && !vadi) vadi = vadiMatch[1].trim();
      if (samvadiMatch && !samvadi) samvadi = samvadiMatch[1].trim();
      if (timeMatch && !time) time = timeMatch[1].trim();
    }
  }

  // 3. Extract First Music Cell Details
  const musicCell = cells.find((c: any) => c.cell_type === 'music');
  let tala = '';
  let sa = '';
  let cellTitle = '';
  const noteLines: string[] = [];

  if (musicCell) {
    const lines = Array.isArray(musicCell.source)
      ? musicCell.source
      : (musicCell.source || '').split('\n');

    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.startsWith('@tala ')) {
        tala = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('@taal ')) {
        tala = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('@sa ')) {
        sa = trimmed.slice(4).trim();
      } else if (trimmed.startsWith('@title ') && !cellTitle) {
        cellTitle = trimmed.slice(7).trim();
      } else if (trimmed.startsWith('#') && !cellTitle && !trimmed.startsWith('#voice')) {
        cellTitle = trimmed.replace(/^#+\s*/, '').trim();
      } else if (
        !trimmed.startsWith('@') &&
        !trimmed.startsWith('#') &&
        trimmed.length > 0 &&
        noteLines.length < 2
      ) {
        noteLines.push(trimmed);
      }
    }
  }

  // 4. Construct rich description
  const descParts: string[] = [];
  if (raag) descParts.push(raag);
  if (thaat) descParts.push(`Thaat: ${thaat}`);
  if (vadi) descParts.push(`Vadi: ${vadi}`);
  if (samvadi) descParts.push(`Samvadi: ${samvadi}`);
  if (tala) descParts.push(`Tala: ${tala}`);
  if (sa) descParts.push(`Sa: ${sa}`);
  if (author) descParts.push(`By ${author}`);

  const description =
    descParts.length > 0
      ? descParts.join(' • ')
      : 'Indian classical music notation notebook. Open to play, edit and practice interactive swara visualizer.';

  return {
    title,
    author,
    raag: raag || 'Indian Classical Music',
    thaat,
    vadi,
    samvadi,
    time,
    tala,
    sa,
    cellTitle,
    noteLines,
    description,
  };
}
