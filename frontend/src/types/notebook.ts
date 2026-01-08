export interface NotebookCell {
  id: string; // Unique identifier for tracking
  cell_type: string;
  source: string[] | string;
  metadata?: {
    language?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface Notebook {
  imnb_version: number;
  metadata: {
    title?: string;
    [key: string]: any;
  };
  cells: NotebookCell[];
}
