import { PrismaClient } from "@prisma/client";

// Configurare connection pooling pentru performanță optimă
const prismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};

// Connection pooling configuration pentru Supabase
// Supabase recomandă: connection_limit=1 pentru pooler, direct connection pentru migrații
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient(prismaClientOptions);
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient(prismaClientOptions);

// Graceful shutdown
if (process.env.NODE_ENV === "production") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect();
  });
}

export default prisma;
