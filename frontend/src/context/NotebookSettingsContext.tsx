import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

interface NotebookSettingsContextType {
  defaultInstruments: Record<string, string>;
  updateDefaultInstrument: (voiceName: string, instrumentId: string) => void;
  showVisualizer: boolean;
  toggleVisualizer: () => void;
  showCode: boolean;
  toggleCode: () => void;
  autoSaveEnabled: boolean;
  toggleAutoSave: () => void;
  language: 'en' | 'hi';
  setLanguage: (lang: 'en' | 'hi') => void;
  globalZoomLevel: number;
  setGlobalZoomLevel: (zoom: number | ((prev: number) => number)) => void;
}

const NotebookSettingsContext = createContext<
  NotebookSettingsContextType | undefined
>(undefined);

export function NotebookSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [defaultInstruments, setDefaultInstruments] = useState<
    Record<string, string>
  >({
    default: 'sitar-sampler',
  });
  const [showVisualizer, setShowVisualizer] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    const saved = localStorage.getItem('sargam-autosave-enabled');
    return saved === null ? true : saved === 'true';
  });
  const [language, setLanguage] = useState<'en' | 'hi'>(() => {
    const saved = localStorage.getItem('sargam-language');
    return (saved as 'en' | 'hi') || 'en';
  });
  const [globalZoomLevel, setGlobalZoomLevelState] = useState<number>(() => {
    const saved = localStorage.getItem('sargam-global-zoom');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3) {
        return parsed;
      }
    }
    return 1;
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sargam-language') {
        setLanguage((e.newValue as 'en' | 'hi') || 'en');
      }
      if (e.key === 'sargam-global-zoom' && e.newValue) {
        const parsed = parseFloat(e.newValue);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3) {
          setGlobalZoomLevelState(parsed);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleVisualizer = () => setShowVisualizer((prev) => !prev);
  const toggleCode = () => setShowCode((prev) => !prev);
  const toggleAutoSave = () => {
    setAutoSaveEnabled((prev) => {
      const newValue = !prev;
      localStorage.setItem('sargam-autosave-enabled', String(newValue));
      return newValue;
    });
  };

  const updateLanguage = (newLang: 'en' | 'hi') => {
    setLanguage(newLang);
    localStorage.setItem('sargam-language', newLang);
  };

  const setGlobalZoomLevel = (zoom: number | ((prev: number) => number)) => {
    setGlobalZoomLevelState((prev) => {
      const next = typeof zoom === 'function' ? zoom(prev) : zoom;
      const clamped = Math.min(3, Math.max(0.5, Math.round(next * 100) / 100));
      localStorage.setItem('sargam-global-zoom', String(clamped));
      return clamped;
    });
  };

  const updateDefaultInstrument = (voiceName: string, instrumentId: string) => {
    setDefaultInstruments((prev) => ({
      ...prev,
      [voiceName]: instrumentId,
    }));
  };

  return (
    <NotebookSettingsContext.Provider
      value={{
        defaultInstruments,
        updateDefaultInstrument,
        showVisualizer,
        toggleVisualizer,
        showCode,
        toggleCode,
        autoSaveEnabled,
        toggleAutoSave,
        language,
        setLanguage: updateLanguage,
        globalZoomLevel,
        setGlobalZoomLevel,
      }}
    >
      {children}
    </NotebookSettingsContext.Provider>
  );
}

export function useNotebookSettings() {
  const context = useContext(NotebookSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useNotebookSettings must be used within a NotebookSettingsProvider'
    );
  }
  return context;
}
