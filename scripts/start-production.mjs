// Set before loading the server (including dotenv and all imported modules).
process.env.NODE_ENV = 'production';
await import('../dist/server.cjs');
