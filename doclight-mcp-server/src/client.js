import axios from 'axios';
import FormData from 'form-data';

export class DocLightClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * API 요청 헬퍼
   */
  async request(method, path, data = null) {
    const url = `${this.baseUrl}/api${path}`;

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'X-API-Key': this.apiKey  // Header 방식 유지
        },
        data,
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * 디렉토리 트리 조회
   */
  async getTree(path = '/') {
    return this.request('GET', `/tree?path=${encodeURIComponent(path)}`);
  }

  /**
   * 파일 읽기
   */
  async readFile(path) {
    const url = `${this.baseUrl}/api/raw?path=${encodeURIComponent(path)}`;

    try {
      const response = await axios({
        method: 'GET',
        url,
        headers: {
          'X-API-Key': this.apiKey
        },
        timeout: 10000,
        responseType: 'text'  // text/plain 응답 처리
      });

      // raw API는 text/plain으로 직접 텍스트 반환
      return { content: response.data };
    } catch (error) {
      if (error.response) {
        throw new Error(`API error: ${error.response.status}`);
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * 파일 생성/수정 (multipart/form-data)
   */
  async createFile(path, content) {
    const form = new FormData();

    // 파일명과 디렉토리 분리
    const pathParts = path.split('/').filter(p => p);
    const filename = pathParts.pop();
    const dirPath = pathParts.join('/');  // 슬래시 제거

    // Buffer로 변환
    const buffer = Buffer.from(content, 'utf-8');
    form.append('file', buffer, {
      filename: filename,
      contentType: 'text/markdown'
    });

    const url = `${this.baseUrl}/api/upload?path=${encodeURIComponent(dirPath)}`;

    try {
      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
          'X-API-Key': this.apiKey
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * 파일 삭제
   */
  async deleteFile(path) {
    return this.request('DELETE', `/entry?path=${encodeURIComponent(path)}`);
  }
}
