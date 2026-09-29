import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getDatabase } from "./db";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error("Configura BETTER_AUTH_SECRET y BETTER_AUTH_URL antes de iniciar sesión.");
  }
  const database = getDatabase();
  return betterAuth({
    appName: "Gestión Educacional",
    secret,
    baseURL,
    database: prismaAdapter(database, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    user: {
      additionalFields: {
        role: { type: ["SUPERUSUARIO", "ADMINISTRADOR"], input: false, defaultValue: "ADMINISTRADOR" },
        active: { type: "boolean", input: false, defaultValue: true },
      },
    },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 30 },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await database.user.findUnique({ where: { id: session.userId }, select: { active: true } });
            if (!user?.active) return false;
            return { data: session };
          },
        },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return instance ??= createAuth();
}
