import sql from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  try {
    const tickers = await sql`
      SELECT symbol, name, exchange 
      FROM managed_tickers 
      WHERE is_active = true 
      ORDER BY symbol ASC
    `;
    return { tickers };
  } catch (error) {
    console.error('Failed to fetch tickers:', error);
    return { tickers: [] };
  }
};
