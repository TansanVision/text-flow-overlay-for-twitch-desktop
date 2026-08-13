import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32') {
  throw new Error('The portable build currently supports Windows only.');
}

const projectRoot = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const executableName = 'twitch-text-flow-overlay.exe';
const builtExecutable = path.join(projectRoot, 'src-tauri', 'target', 'release', executableName);
const portableDirectory = path.join(projectRoot, 'release', 'portable', 'Twitch Text Flow Overlay');
const portableExecutable = path.join(portableDirectory, 'Twitch Text Flow Overlay.exe');
const zipPath = path.join(
  projectRoot,
  'release',
  `Twitch-Text-Flow-Overlay-v${version}-windows-portable.zip`,
);

await run(process.execPath, ['scripts/run-tauri.mjs', 'build', '--no-bundle']);

await rm(portableDirectory, { recursive: true, force: true });
await mkdir(portableDirectory, { recursive: true });
await copyFile(builtExecutable, portableExecutable);
await writeFile(
  path.join(portableDirectory, 'README.txt'),
  [
    'Twitch Text Flow Overlay ポータブル版',
    '',
    '「Twitch Text Flow Overlay.exe」を実行してください。',
    '初回起動時に、このexeと同じ場所へ portable-data フォルダが作成されます。',
    '認証情報、設定、カスタムスタンプ、反応ユーザー一覧はその中に保存されます。',
    '',
    '更新時は portable-data を残したままexeを差し替えてください。',
    '別PCへ移す場合は、このフォルダ全体をコピーしてください。',
    '動作にはMicrosoft Edge WebView2 Runtimeが必要です。',
    '',
  ].join('\r\n'),
  'utf8',
);

await rm(zipPath, { force: true });
const archiveCommand = `Compress-Archive -LiteralPath '${escapePowerShellLiteral(portableDirectory)}' -DestinationPath '${escapePowerShellLiteral(zipPath)}' -CompressionLevel Optimal`;
await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', archiveCommand]);

console.log(`Portable build created at: ${portableDirectory}`);
console.log(`GitHub Release archive created at: ${zipPath}`);

function escapePowerShellLiteral(value) {
  return value.replaceAll("'", "''");
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Portable build was terminated by ${signal}.`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Portable build failed with exit code ${code}.`));
      }
    });
  });
}
