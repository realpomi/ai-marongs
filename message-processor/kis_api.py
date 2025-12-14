import os
import aiohttp
import asyncio
from datetime import datetime, timedelta
import json

class KisApi:
    def __init__(self):
        self.app_key = os.getenv('KIS_APP_KEY')
        self.app_secret = os.getenv('KIS_APP_SECRET')
        # Use real server by default, but allow override
        self.base_url = os.getenv('KIS_BASE_URL', 'https://openapi.koreainvestment.com:9443')
        self.token = None
        self.token_expiry = None

    async def get_token(self):
        """Get or refresh access token"""
        # Return existing token if valid (buffer of 60 seconds)
        if self.token and self.token_expiry and (self.token_expiry - datetime.now()).total_seconds() > 60:
            return self.token

        url = f"{self.base_url}/oauth2/tokenP"
        headers = {"content-type": "application/json"}
        body = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "appsecret": self.app_secret
        }

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(url, headers=headers, json=body) as response:
                    if response.status == 200:
                        data = await response.json()
                        self.token = data['access_token']
                        # Expires in 86400 seconds (24 hours) typically
                        expires_in = data.get('expires_in', 86400)
                        self.token_expiry = datetime.now() + timedelta(seconds=expires_in)
                        return self.token
                    else:
                        text = await response.text()
                        print(f"Failed to get token: {text}")
                        return None
            except Exception as e:
                print(f"Error getting token: {e}")
                return None

    async def get_current_price(self, ticker: str):
        """Get current price for a US stock ticker"""
        if not self.app_key or not self.app_secret:
            return {"error": "API credentials not configured"}

        token = await self.get_token()
        if not token:
            return {"error": "Failed to authenticate with KIS API"}

        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/price"

        headers = {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": "HHDFS00000300"
        }

        # Try exchanges in order of likelihood
        exchanges = ['NAS', 'NYS', 'AMS']

        async with aiohttp.ClientSession() as session:
            for excd in exchanges:
                params = {
                    "AUTH": "",
                    "EXCD": excd,
                    "SYMB": ticker.upper()
                }

                try:
                    async with session.get(url, headers=headers, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            # Check if successful response
                            if data.get('rt_cd') == '0':
                                output = data.get('output', {})
                                # If price is empty or invalid, it might be the wrong exchange
                                if output and output.get('last'):
                                    return {
                                        "ticker": ticker.upper(),
                                        "price": output.get('last'),
                                        "diff": output.get('diff'),
                                        "rate": output.get('rate'),
                                        "exchange": excd
                                    }
                except Exception as e:
                    print(f"Error fetching price from {excd}: {e}")
                    continue

        return {"error": f"Could not find price for {ticker}"}
