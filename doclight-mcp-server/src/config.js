import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export function loadConfig() {
  const baseUrl = process.env.DOCLIGHT_URL;
  const apiKey = process.env.DOCLIGHT_API_KEY;

  if (!baseUrl) {
    throw new Error('Missing DOCLIGHT_URL environment variable');
  }

  if (!apiKey) {
    throw new Error('Missing DOCLIGHT_API_KEY environment variable');
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey
  };
}
