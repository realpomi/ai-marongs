import os
import asyncio
import json
import aiohttp
from typing import Dict, Any
from nats.aio.client import Client as NATS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
NATS_URL = os.getenv('NATS_URL', 'nats://localhost:4222')
DEBUG_WEBHOOK_URL = os.getenv('DEBUG_WEBHOOK_URL', 'https://discord.com/api/webhooks/1363503466194141326/HygTxWYN51KKtOiSh6hlV2ljI-rXtWBwDJgEOCo5K8vuEXgnmMSBbkOmmDqrzVFWSYpv')


async def send_debug_webhook(title: str, data: dict, color: int = 3447003):
    """Send debug information to Discord webhook"""
    if not DEBUG_WEBHOOK_URL:
        return

    try:
        # Format JSON data for display
        json_str = json.dumps(data, ensure_ascii=False, indent=2, default=str)
        # Truncate if too long
        if len(json_str) > 1900:
            json_str = json_str[:1900] + "\n... (truncated)"

        embed = {
            "title": title,
            "description": f"```json\n{json_str}\n```",
            "color": color,
            "footer": {"text": "Message Processor Debug"}
        }

        async with aiohttp.ClientSession() as session:
            await session.post(
                DEBUG_WEBHOOK_URL,
                json={"embeds": [embed]},
                timeout=aiohttp.ClientTimeout(total=5)
            )
    except Exception as e:
        print(f"Failed to send debug webhook: {e}")


class MessageProcessor:
    """Processes messages received from Discord via NATS"""
    
    def __init__(self):
        self.nc = NATS()
    
    async def connect(self):
        """Connect to NATS server"""
        try:
            await self.nc.connect(NATS_URL)
            print(f"Connected to NATS at {NATS_URL}")
        except Exception as e:
            print(f"Failed to connect to NATS: {e}")
            raise
    
    async def process_message(self, message_data: Dict[str, Any]) -> str:
        """
        Process the message and generate a response.
        This is where you implement your actual message processing logic.

        Args:
            message_data: Dictionary containing full Discord message information
                - message_id: Discord message ID
                - content: Message content
                - created_at: Message creation timestamp (ISO format)
                - edited_at: Message edit timestamp (ISO format) or None
                - jump_url: URL to jump to this message
                - pinned: Whether the message is pinned
                - type: Message type
                - author: {id, name, display_name, discriminator, bot, avatar_url}
                - channel: {id, name, type}
                - guild: {id, name, member_count} or None for DMs
                - mentions: {users: [{id, name}], roles: [{id, name}], channels: [{id, name}], everyone: bool}
                - attachments: [{id, filename, url, size, content_type}]
                - embeds: List of embed dictionaries
                - reference: {message_id, channel_id, guild_id} or None
                - reactions: [{emoji, count}]

        Returns:
            Response string to send back to Discord
        """
        content = message_data.get('content', '')
        author = message_data.get('author', {})
        author_id = author.get('id')
        
        print(f"Processing message from user {author_id}: {content}")
        
        # Greeting response for hi/안녕 (handles mentions like "<@123> 안녕")
        if content.lower().strip() == 'hi' or content.strip() == '안녕' or '안녕' in content or 'hi' in content.lower().split():
            return "반갑습니다"

        # Example processing logic - replace with your actual implementation
        if 'hello' in content.lower():
            return f"안녕하세요! <@{author_id}>님, 무엇을 도와드릴까요?"
        
        elif '날씨' in content or 'weather' in content.lower():
            return "죄송합니다. 날씨 정보 기능은 아직 구현되지 않았습니다."
        
        elif '도움' in content or 'help' in content.lower():
            return """
**사용 가능한 명령어:**
- 안녕/hello: 인사
- 날씨/weather: 날씨 정보 (준비 중)
- 도움/help: 도움말
            """
        
        else:
            # Default response for unrecognized messages
            return f"메시지를 받았습니다: '{content}'. 처리 중입니다... 🤔"
    
    async def handle_discord_message(self, msg):
        """Handle incoming messages from Discord"""
        try:
            # Parse message data
            message_data = json.loads(msg.data.decode())
            print(f"Received message: {message_data}")

            # Send debug webhook: Message received from Discord
            await send_debug_webhook(
                "📥 메시지처리기에서 받은 데이터",
                message_data,
                color=15844367  # Gold
            )

            # Process the message
            response = await self.process_message(message_data)

            # Prepare response data
            channel = message_data.get("channel", {})
            response_data = {
                "channel_id": channel.get("id"),
                "response": response,
                "original_message_id": message_data.get("message_id")
            }

            # Send debug webhook: Response to be sent
            await send_debug_webhook(
                "📤 메시지처리기 → Discord로 전달하는 데이터",
                response_data,
                color=5763719  # Green
            )

            # Publish response back to Discord
            await self.nc.publish(
                "discord.responses",
                json.dumps(response_data).encode()
            )
            print(f"Sent response for message {message_data.get('message_id')}")
            
        except json.JSONDecodeError as e:
            print(f"Error decoding message: {e}")
        except Exception as e:
            print(f"Error handling message: {e}")
    
    async def start(self):
        """Start the message processor"""
        await self.connect()
        
        # Subscribe to Discord messages
        await self.nc.subscribe("discord.messages", cb=self.handle_discord_message)
        print("Subscribed to discord.messages - waiting for messages...")
        
        # Keep the service running
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            await self.nc.close()


async def main():
    """Main entry point"""
    processor = MessageProcessor()
    await processor.start()


if __name__ == '__main__':
    print("Starting Message Processor...")
    asyncio.run(main())
