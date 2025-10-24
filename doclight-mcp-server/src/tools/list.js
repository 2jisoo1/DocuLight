import { DocLightClient } from '../client.js';

export async function listDocuments(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    const result = await client.getTree(path);

    // API 응답: {path, dirs: [{name}], files: [{name, size}]}
    let output = '';

    // 디렉토리 출력
    if (result.dirs && result.dirs.length > 0) {
      for (const dir of result.dirs) {
        output += `📁 ${dir.name}/\n`;
      }
    }

    // 파일 출력
    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        output += `📄 ${file.name}\n`;
      }
    }

    if (!output) {
      output = '(Empty directory)';
    }

    return {
      content: [
        {
          type: 'text',
          text: `# Documents at ${path}\n\n${output}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to list documents: ${error.message}`);
  }
}
