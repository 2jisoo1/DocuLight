import { DocLightClient } from '../client.js';

export async function deleteDocument(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    // Remove leading slash if present
    const relativePath = path.replace(/^\/+/, '');
    const result = await client.deleteFile(relativePath);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully deleted: ${path}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}
