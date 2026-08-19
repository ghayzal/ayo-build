// Side-effect module: loads .env before anything else reads process.env.
//
// This has to be its own module imported first. ES module imports are evaluated
// before any statement in the importing file, so calling loadEnvFile() inline in
// server.js would run AFTER rpc.js had already read process.env.SOLANA_RPC.
try {
  process.loadEnvFile();
} catch {
  // no .env file, or a Node too old for loadEnvFile. Inline env vars still work.
}
