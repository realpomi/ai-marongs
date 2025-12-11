import os
import asyncio
import json
import re
import discord
import aiohttp
from discord.ext import commands
from nats.aio.client import Client as NATS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
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
            "footer": {"text": "Discord Bot Debug"}
        }

        async with aiohttp.ClientSession() as session:
            await session.post(
                DEBUG_WEBHOOK_URL,
                json={"embeds": [embed]},
                timeout=aiohttp.ClientTimeout(total=5)
            )
    except Exception as e:
        print(f"Failed to send debug webhook: {e}")

# Bot setup with intents
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# NATS client
nc = NATS()


class DiscordNATSBridge:
    """Handles communication between Discord and NATS"""
    
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
    
    async def publish_message(self, message: discord.Message):
        """Publish a Discord message to NATS for processing"""
        # Remove mentions from content (e.g., <@123456789> or <@!123456789>)
        clean_content = re.sub(r'<@!?\d+>', '', message.content).strip()

        # Build comprehensive message data
        message_data = {
            # Message info
            "message_id": message.id,
            "content": clean_content,
            "created_at": message.created_at.isoformat(),
            "edited_at": message.edited_at.isoformat() if message.edited_at else None,
            "jump_url": message.jump_url,
            "pinned": message.pinned,
            "type": str(message.type),

            # Author info
            "author": {
                "id": message.author.id,
                "name": message.author.name,
                "display_name": message.author.display_name,
                "discriminator": message.author.discriminator,
                "bot": message.author.bot,
                "avatar_url": str(message.author.avatar.url) if message.author.avatar else None,
            },

            # Channel info
            "channel": {
                "id": message.channel.id,
                "name": getattr(message.channel, 'name', 'DM'),
                "type": str(message.channel.type),
            },

            # Guild (server) info
            "guild": {
                "id": message.guild.id,
                "name": message.guild.name,
                "member_count": message.guild.member_count,
            } if message.guild else None,

            # Mentions
            "mentions": {
                "users": [{"id": u.id, "name": u.name} for u in message.mentions],
                "roles": [{"id": r.id, "name": r.name} for r in message.role_mentions],
                "channels": [{"id": c.id, "name": c.name} for c in message.channel_mentions],
                "everyone": message.mention_everyone,
            },

            # Attachments
            "attachments": [
                {
                    "id": a.id,
                    "filename": a.filename,
                    "url": a.url,
                    "size": a.size,
                    "content_type": a.content_type,
                }
                for a in message.attachments
            ],

            # Embeds
            "embeds": [e.to_dict() for e in message.embeds],

            # Reply reference
            "reference": {
                "message_id": message.reference.message_id,
                "channel_id": message.reference.channel_id,
                "guild_id": message.reference.guild_id,
            } if message.reference else None,

            # Reactions (if any)
            "reactions": [
                {
                    "emoji": str(r.emoji),
                    "count": r.count,
                }
                for r in message.reactions
            ],
        }

        try:
            await nc.publish(
                "discord.messages",
                json.dumps(message_data).encode()
            )
            print(f"Published message to NATS: {message.id}")
            print(f"[Discord → 메시지처리기] 전송 데이터: {json.dumps(message_data, ensure_ascii=False, indent=2)}")

            # Send debug webhook: Discord → Processor
            await send_debug_webhook(
                "📤 Discord → 메시지처리기 (discord.messages)",
                message_data,
                color=3447003  # Blue
            )
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

            # Send debug webhook: Processor → Discord (response received)
            await send_debug_webhook(
                "📥 메시지처리기 → Discord (discord.responses)",
                data,
                color=15844367  # Gold
            )

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

    # Instant ping-pong response (no NATS)
    if message.content.lower() == 'ping':
        await message.channel.send('Pong!')
        return

    # Ignore messages that don't mention the bot or use commands
    if bot.user.mentioned_in(message) or message.content.startswith('!'):
        # Publish to NATS for processing
        await bridge.publish_message(message)
    
    # Process commands
    await bot.process_commands(message)


@bot.command(name='ping')
async def ping(ctx):
    """Simple ping command to test bot responsiveness"""
    latency = round(bot.latency * 1000)
    await ctx.send(f'Pong! 🏓 ({latency}ms)')


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
