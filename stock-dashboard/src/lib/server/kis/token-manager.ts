import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { TokenData } from './types';
import { env } from '$env/dynamic/private';

const TOKEN_DIR = 'data';
const TOKEN_FILE = '.access_token.json';

class KisTokenManager {
  private tokenPath: string;
  private tokenDir: string;
  private cachedToken: TokenData | null = null;

  constructor() {
    this.tokenDir = path.join(process.cwd(), TOKEN_DIR);
    this.tokenPath = path.join(this.tokenDir, TOKEN_FILE);
  }

  /**
   * 유효한 토큰을 반환합니다. 필요시 자동 갱신합니다.
   */
  async getToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    if (this.cachedToken && this.isValid(this.cachedToken)) {
      return this.cachedToken.access_token;
    }

    // 2. 파일에서 로드
    const fileToken = await this.loadFromFile();
    if (fileToken && this.isValid(fileToken)) {
      this.cachedToken = fileToken;
      return fileToken.access_token;
    }

    // 3. 새 토큰 발급
    return this.refreshToken();
  }

  /**
   * 토큰을 강제로 갱신합니다.
   */
  async refreshToken(): Promise<string> {
    console.log('[KIS] 토큰 발급 요청...');

    const response = await fetch(`${env.KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: env.KIS_APP_KEY,
        appsecret: env.KIS_APP_SECRET
      })
    });

    if (!response.ok) {
      throw new Error(`토큰 발급 실패: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const tokenData: TokenData = {
      access_token: data.access_token,
      expires_at: data.access_token_token_expired // KIS 형식: "YYYY-MM-DD HH:mm:ss"
    };

    await this.saveToFile(tokenData);
    this.cachedToken = tokenData;

    console.log(`[KIS] 토큰 발급 성공 (만료: ${tokenData.expires_at})`);
    return tokenData.access_token;
  }

  /**
   * 토큰 상태 정보를 반환합니다.
   */
  async getStatus(): Promise<{ valid: boolean; expiresAt: string | null; remainingMinutes: number | null }> {
    const token = await this.loadFromFile();
    if (!token) {
      return { valid: false, expiresAt: null, remainingMinutes: null };
    }

    const expiresAt = this.parseExpiresAt(token.expires_at);
    const now = new Date();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    return {
      valid: remainingMs > 5 * 60 * 1000, // 5분 버퍼
      expiresAt: token.expires_at,
      remainingMinutes: remainingMinutes > 0 ? remainingMinutes : 0
    };
  }

  private isValid(token: TokenData): boolean {
    const expiresAt = this.parseExpiresAt(token.expires_at);
    const now = new Date();
    // 5분 버퍼
    return now.getTime() < expiresAt.getTime() - 5 * 60 * 1000;
  }

  private parseExpiresAt(expiresStr: string): Date {
    // KIS 형식: "YYYY-MM-DD HH:mm:ss"
    return new Date(expiresStr.replace(' ', 'T'));
  }

  private async loadFromFile(): Promise<TokenData | null> {
    if (!existsSync(this.tokenPath)) {
      return null;
    }

    try {
      const content = await readFile(this.tokenPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn('[KIS] 토큰 파일 파싱 실패:', e);
      return null;
    }
  }

  private async saveToFile(token: TokenData): Promise<void> {
    // 디렉토리가 없으면 생성
    if (!existsSync(this.tokenDir)) {
      await mkdir(this.tokenDir, { recursive: true });
    }
    await writeFile(this.tokenPath, JSON.stringify(token, null, 2));
  }
}

// 싱글톤 인스턴스
export const tokenManager = new KisTokenManager();
