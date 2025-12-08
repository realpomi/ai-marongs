#!/bin/bash
# Quick start script for ai-marongs Discord Bot

echo "🚀 ai-marongs Discord Bot Setup"
echo "================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start NATS server
echo "📡 Starting NATS server..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo "✅ NATS server started successfully"
else
    echo "❌ Failed to start NATS server"
    exit 1
fi

echo ""
echo "⏳ Waiting for NATS to be ready..."
sleep 3

# Check if NATS is ready
if curl -s http://localhost:8222/varz > /dev/null 2>&1; then
    echo "✅ NATS is ready"
else
    echo "⚠️  NATS may not be fully ready yet. Continuing..."
fi

echo ""
echo "📋 Next steps:"
echo ""
echo "1. Set up Discord Bot:"
echo "   cd discord-bot"
echo "   pip install -r requirements.txt"
echo "   cp .env.example .env"
echo "   # Edit .env and add your DISCORD_TOKEN"
echo "   python bot.py"
echo ""
echo "2. In another terminal, set up Message Processor:"
echo "   cd message-processor"
echo "   pip install -r requirements.txt"
echo "   cp .env.example .env"
echo "   python processor.py"
echo ""
echo "📚 For more information, see README.md"
echo ""
echo "To stop NATS server, run: docker-compose down"
