import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tokenManager } from '$lib/server/kis';

// GET: 토큰 상태 조회
export const GET: RequestHandler = async () => {
  try {
    const status = await tokenManager.getStatus();
    return json(status);
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};

// POST: 토큰 강제 갱신
export const POST: RequestHandler = async () => {
  try {
    await tokenManager.refreshToken();
    const status = await tokenManager.getStatus();
    return json({ success: true, ...status });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
