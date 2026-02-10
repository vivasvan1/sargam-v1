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

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sargam-language') {
        setLanguage((e.newValue as 'en' | 'hi') || 'en');
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
