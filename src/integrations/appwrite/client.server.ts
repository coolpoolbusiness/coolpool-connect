import { Client, Databases, Users } from "node-appwrite";

function getServerConfig() {
  // Portable default: reach Appwrite via the public domain (nginx fronts it),
  // never a box-specific address — a migrated server must not silently point
  // at the old machine.
  const endpoint =
    process.env.VITE_APPWRITE_ENDPOINT ||
    process.env.APPWRITE_ENDPOINT ||
    "https://coolpool.in/v1";
  const projectId = process.env.APPWRITE_PROJECT_ID || "69f23e9d003845289bcc";
  const databaseId = process.env.APPWRITE_DATABASE_ID || "69f2e5f6000a532410c0";
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing APPWRITE_API_KEY environment variable.");
  }

  return { endpoint, projectId, databaseId, apiKey };
}

const config = getServerConfig();

const serverClient = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

export const appwriteUsers = new Users(serverClient);
export const appwriteDatabases = new Databases(serverClient);
export const appwriteServerConfig = config;
