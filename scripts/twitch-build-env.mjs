import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export function twitchBuildEnvironment(projectRoot, environment = process.env) {
  let clientId = environment.TWITCH_CLIENT_ID;
  if (clientId === undefined) {
    try {
      const contents = readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
      clientId = parseEnv(contents).TWITCH_CLIENT_ID;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  clientId = clientId?.trim();
  if (!clientId) {
    throw new Error(
      'TWITCH_CLIENT_ID is required. Copy .env.example to .env.local and set your own Twitch Client ID, or set the build environment variable.',
    );
  }
  if (/\s/.test(clientId)) {
    throw new Error('TWITCH_CLIENT_ID must not contain whitespace.');
  }

  // Only load the Client ID from the local file, not arbitrary build/runtime settings.
  return { ...environment, TWITCH_CLIENT_ID: clientId };
}
