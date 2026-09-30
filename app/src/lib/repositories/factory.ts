import { IRepositoryManager } from "./types";
import { InMemoryRepositoryManager } from "./inMemoryRepository";
import { SupabaseRepositoryManager } from "./supabaseRepository";

export function createRepositoryManager(): IRepositoryManager {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const demoMode = process.env.DEMO_MODE !== "false";

  // Check if valid Supabase configuration is present and DEMO_MODE is explicitly disabled
  const hasValidSupabaseConfig =
    Boolean(supabaseUrl && serviceKey) &&
    supabaseUrl !== "https://your-project.supabase.co" &&
    !supabaseUrl?.includes("placeholder") &&
    !serviceKey?.includes("placeholder");

  if (hasValidSupabaseConfig && !demoMode) {
    console.log("⚡ [RepositoryFactory] Connected to Supabase PostgreSQL Repository");
    return new SupabaseRepositoryManager(supabaseUrl!, serviceKey!);
  }

  console.log("🛠️ [RepositoryFactory] Using In-Memory Repository (DEMO_MODE active or Supabase credentials unconfigured)");
  return new InMemoryRepositoryManager();
}

// Preserve singleton on globalThis across Next.js reloads
const globalForRepoManager = globalThis as unknown as {
  repositoryManager: IRepositoryManager | undefined;
};

export const repositoryManager =
  globalForRepoManager.repositoryManager ?? createRepositoryManager();

if (process.env.NODE_ENV !== "production") {
  globalForRepoManager.repositoryManager = repositoryManager;
}
