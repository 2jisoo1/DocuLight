import { DocLightClient } from '../client.js';

export async function createDocument(config, path, content) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    // Remove leading slash if present
    const relativePath = path.replace(/^\/+/, '');
    const result = await client.createFile(relativePath, content);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created/updated: ${path}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to create document: ${error.message}`);
  }
}
