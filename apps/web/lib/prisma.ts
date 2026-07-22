import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

const databaseUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_0xdOBmSkTI9o@ep-sparkling-heart-au9zlqx2-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
