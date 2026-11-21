import dotenv from "dotenv";

dotenv.config();

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 5000),
  clientOrigin: env("CLIENT_ORIGIN", "http://localhost:3000"),
  jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: env("JWT_EXPIRES_IN", "8h"),
  nodeEnv: env("NODE_ENV", "development"),
  isProd: env("NODE_ENV", "development") === "production",
};
