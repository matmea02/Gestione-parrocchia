import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface Parish {
  id: string;
  name: string;
  color?: string;
  logoUrl?: string;
}

interface ParishContextType {
  currentParish: Parish | null;
  setCurrentParishId: (id: string | null) => void;
  loading: boolean;
}

const ParishContext = createContext<ParishContextType | undefined>(undefined);

export const ParishProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentParishId, setCurrentParishIdState] = useState<string | null>(() => localStorage.getItem('selectedParishId'));
  const [currentParish, setCurrentParish] = useState<Parish | null>(null);
  const [loading, setLoading] = useState(true);

  const setCurrentParishId = (id: string | null) => {
    setCurrentParishIdState(id);
    if (id) {
      localStorage.setItem('selectedParishId', id);
    } else {
      localStorage.removeItem('selectedParishId');
      setCurrentParish(null);
    }
  };

  useEffect(() => {
    if (!currentParishId) {
      setCurrentParish(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(doc(db, 'parishes', currentParishId), (snap) => {
      if (snap.exists()) {
        setCurrentParish({ id: snap.id, ...snap.data() } as Parish);
      } else {
        setCurrentParish(null);
        // If it doesn't exist, maybe clear it
        // setCurrentParishId(null);
      }
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return unsub;
  }, [currentParishId]);

  return (
    <ParishContext.Provider value={{ currentParish, setCurrentParishId, loading }}>
      {children}
    </ParishContext.Provider>
  );
};

export const useParish = () => {
  const context = useContext(ParishContext);
  if (context === undefined) {
    throw new Error('useParish must be used within a ParishProvider');
  }
  return context;
};

export const useParishCollection = (name: string) => {
  const { currentParish } = useParish();
  if (!currentParish) throw new Error('No parish selected');
  return collection(db, 'parishes', currentParish.id, name);
};

export const useParishDoc = (collectionName: string, docId: string) => {
  const { currentParish } = useParish();
  if (!currentParish) throw new Error('No parish selected');
  return doc(db, 'parishes', currentParish.id, collectionName, docId);
};
