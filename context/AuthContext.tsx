import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { toast } from "react-hot-toast";
import { auth, User } from "../lib/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const token = localStorage.getItem("auth_token");
    if (token) {
      auth.getCurrentUser(token).then((userData) => {
        if (userData) {
          setUser(userData);
        } else {
          localStorage.removeItem("auth_token");
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    const { user: userData, token, error } = await auth.signIn(email, password);

    if (error) {
      throw error;
    }

    if (userData && token) {
      setUser(userData);
      localStorage.setItem("auth_token", token);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { user: userData, error } = await auth.signUp(
      email,
      password,
      fullName
    );

    if (error) {
      throw error;
    }

    toast.success("Account created successfully! Please sign in.");
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem("auth_token");
    toast.success("Signed out successfully");
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
