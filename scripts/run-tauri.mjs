import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const command = process.argv[2];
const commandArguments = process.argv.slice(3);
if (command !== 'dev' && command !== 'build') {
  throw new Error('Expected the Tauri command to be either "dev" or "build".');
}

const cargoBin = path.join(homedir(), '.cargo', 'bin');
const executable = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
);

const child = spawn(executable, [command, ...commandArguments], {
  env: {
    ...process.env,
    PATH: `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
