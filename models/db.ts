import "server-only";
import { databaseAdapter } from "./database-adapter";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");
  const client = new PrismaClient({ adapter: databaseAdapter(connectionString) });
  globalForPrisma.prisma = client;
  return client;
}
