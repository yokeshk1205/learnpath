export function getDatabaseConfig(environment?: NodeJS.ProcessEnv): {
  connectionString: string;
  connectionTimeoutMillis: number;
  ssl: false | { rejectUnauthorized: boolean };
};
export function databaseFailureHint(code?: string): string;
