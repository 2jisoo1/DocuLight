import { DocLightClient } from '../client.js';

export async function readDocument(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    // Remove leading slash if present (API expects relative paths)
    const relativePath = path.replace(/^\/+/, '');
    const result = await client.readFile(relativePath);

    return {
      content: [
        {
          type: 'text',
          text: `# ${path}\n\n${result.content}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to read document: ${error.message}`);
  }
}
