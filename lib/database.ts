import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: import.meta.env.VITE_DATABASE_URL,
  ssl: import.meta.env.MODE === 'production' ? { rejectUnauthorized: false } : false
});

export const db = {
  query: async (text: string, params?: any[]) => {
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  },
};

export const checkDatabaseConnection = async () => {
  try {
    const result = await db.query("SELECT COUNT(*) FROM products LIMIT 1");
    return { success: true, message: "Connected to Railway PostgreSQL" };
  } catch (error) {
    console.error("Database connection error:", error);
    return {
      success: false,
      message: "Failed to connect to Railway PostgreSQL database",
    };
  }
};
