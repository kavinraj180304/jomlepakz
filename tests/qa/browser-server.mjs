import { spawn, spawnSync } from 'node:child_process';

// Compile and serve in the same inherited environment so public Supabase values
// cannot come from a stale hosted production bundle during a local write test.
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { stdio: 'inherit', env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3230'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', code => process.exit(code ?? 1));
