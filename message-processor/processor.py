import os
import asyncio
import json
from typing import Dict, Any
from nats.aio.client import Client as NATS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
NATS_URL = os.getenv('NATS_URL', 'nats://localhost:4222')


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
        
        # Greeting response for hi/안녕
        if content.lower() == 'hi' or content == '안녕':
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
            
            # Process the message
            response = await self.process_message(message_data)
            
            # Prepare response data
            channel = message_data.get("channel", {})
            response_data = {
                "channel_id": channel.get("id"),
                "response": response,
                "original_message_id": message_data.get("message_id")
            }
            
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
