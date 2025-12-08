import os
import asyncio
import json
from typing import Optional
import discord
from discord.ext import commands
from nats.aio.client import Client as NATS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
NATS_URL = os.getenv('NATS_URL', 'nats://localhost:4222')

# Bot setup with intents
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# NATS client
nc = NATS()


class DiscordNATSBridge:
    """Handles communication between Discord and NATS"""
    
    def __init__(self):
        self.pending_responses = {}
        
    async def connect_nats(self):
        """Connect to NATS server"""
        try:
            await nc.connect(NATS_URL)
            print(f"Connected to NATS at {NATS_URL}")
            
            # Subscribe to responses
            await nc.subscribe("discord.responses", cb=self.handle_response)
            print("Subscribed to discord.responses")
        except Exception as e:
            print(f"Failed to connect to NATS: {e}")
            raise
    
    async def publish_message(self, channel_id: int, author_id: int, content: str, message_id: int):
        """Publish a Discord message to NATS for processing"""
        message_data = {
            "channel_id": channel_id,
            "author_id": author_id,
            "content": content,
            "message_id": message_id
        }
        
        try:
            await nc.publish(
                "discord.messages",
                json.dumps(message_data).encode()
            )
            print(f"Published message to NATS: {message_id}")
        except Exception as e:
            print(f"Failed to publish message to NATS: {e}")
    
    async def handle_response(self, msg):
        """Handle responses from NATS"""
        try:
            data = json.loads(msg.data.decode())
            channel_id = data.get("channel_id")
            response_text = data.get("response")
            original_message_id = data.get("original_message_id")
            
            print(f"Received response from NATS for message {original_message_id}")
            
            # Send response back to Discord
            channel = bot.get_channel(channel_id)
            if channel:
                await channel.send(response_text)
            else:
                print(f"Channel {channel_id} not found")
                
        except Exception as e:
            print(f"Error handling NATS response: {e}")


# Initialize bridge
bridge = DiscordNATSBridge()


@bot.event
async def on_ready():
    """Called when the bot is ready"""
    print(f'{bot.user} has connected to Discord!')
    print(f'Bot is in {len(bot.guilds)} guilds')
    
    # Connect to NATS
    await bridge.connect_nats()


@bot.event
async def on_message(message):
    """Handle incoming Discord messages"""
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return
    
    # Ignore messages that don't mention the bot or use commands
    if bot.user.mentioned_in(message) or message.content.startswith('!'):
        # Publish to NATS for processing
        await bridge.publish_message(
            channel_id=message.channel.id,
            author_id=message.author.id,
            content=message.content,
            message_id=message.id
        )
    
    # Process commands
    await bot.process_commands(message)


@bot.command(name='ping')
async def ping(ctx):
    """Simple ping command to test bot responsiveness"""
    await ctx.send('Pong!')


@bot.command(name='status')
async def status(ctx):
    """Check NATS connection status"""
    if nc.is_connected:
        await ctx.send('✅ NATS connection is active')
    else:
        await ctx.send('❌ NATS connection is down')


async def main():
    """Main entry point"""
    try:
        await bot.start(DISCORD_TOKEN)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        if nc.is_connected:
            await nc.close()
        await bot.close()


if __name__ == '__main__':
    if not DISCORD_TOKEN:
        print("Error: DISCORD_TOKEN not set in environment variables")
        exit(1)
    
    asyncio.run(main())
