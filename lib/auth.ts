import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./database";

const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || "your-secret-key";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export const auth = {
  // Sign up new user
  signUp: async (email: string, password: string, full_name: string) => {
    try {
      // Check if user exists
      const existingUser = await db.query(
        "SELECT id FROM profiles WHERE email = $1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error("User already exists");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const result = await db.query(
        "INSERT INTO profiles (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, created_at",
        [email, hashedPassword, full_name, "OPERATOR"]
      );

      return { user: result.rows[0], error: null };
    } catch (error) {
      return { user: null, error };
    }
  },

  // Sign in user
  signIn: async (email: string, password: string) => {
    try {
      const result = await db.query(
        "SELECT id, email, password_hash, full_name, role, created_at FROM profiles WHERE email = $1",
        [email]
      );

      if (result.rows.length === 0) {
        throw new Error("Invalid credentials");
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        throw new Error("Invalid credentials");
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const { password_hash, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token,
        error: null,
      };
    } catch (error) {
      return { user: null, token: null, error };
    }
  },

  // Get current user from token
  getCurrentUser: async (token: string) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const result = await db.query(
        "SELECT id, email, full_name, role, created_at FROM profiles WHERE id = $1",
        [decoded.userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  },
};
