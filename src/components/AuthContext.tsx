import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, db } from '../firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { Shield, Key, User as UserIcon, Loader2, LogOut, Church, AlertCircle } from 'lucide-react';

interface PortalUser {
  id: string;
  username: string;
  volunteerName: string;
  permissions: {
    [parishId: string]: {
      enabled: boolean;
      modules: string[];
    }
  };
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  portalUser: PortalUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithPortal: (username: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  portalUser: null, 
  loading: true,
  logout: async () => {},
  loginWithGoogle: async () => {},
  loginWithPortal: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for portal session
    const savedPortalUser = localStorage.getItem('portal_user');
    let portalUnsub: (() => void) | undefined;

    if (savedPortalUser) {
      const initialUser = JSON.parse(savedPortalUser);
      setPortalUser(initialUser);

      // Setup real-time listener for the portal user document
      portalUnsub = onSnapshot(doc(db, 'portal_users', initialUser.id), (docSnap) => {
        if (docSnap.exists()) {
          const updatedUser = { id: docSnap.id, ...docSnap.data() } as PortalUser;
          setPortalUser(updatedUser);
          localStorage.setItem('portal_user', JSON.stringify(updatedUser));
        } else {
          // User deleted or disabled
          setPortalUser(null);
          localStorage.removeItem('portal_user');
        }
      });
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (portalUnsub) portalUnsub();
    };
  }, []);

  const logout = async () => {
    await auth.signOut();
    localStorage.removeItem('portal_user');
    setPortalUser(null);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithPortal = async (username: string, password: string) => {
    const q = query(
      collection(db, 'portal_users'), 
      where('username', '==', username), 
      where('password', '==', password),
      where('isEnabled', '==', true)
    );
    const snap = await getDocs(q);
    
    if (snap.empty) {
      throw new Error('Credenziali non valide o accesso non abilitato.');
    } else {
      const userData = snap.docs[0].data();
      const pUser = { id: snap.docs[0].id, ...userData } as PortalUser;
      
      // Sign in anonymously to Firebase Auth to allow Firestore rules to work
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Portal login: Anonymous sign-in failed", e);
        }
      }
      
      localStorage.setItem('portal_user', JSON.stringify(pUser));
      setPortalUser(pUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, portalUser, loading, logout, loginWithGoogle, loginWithPortal }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, portalUser, loading } = useAuth();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
    </div>
  );

  const isPublicPath = window.location.pathname === '/login';

  if (!user && !portalUser && !isPublicPath) {
    // Redirect logic handled by App routing or conditional rendering
    // For this prototype, we'll just show the children if it's meant to be managed by Routes
    return <>{children}</>;
  }

  return <>{children}</>;
};
