#!/bin/bash
set -e

echo "=== MobilePay Bogfører - Setup ==="

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Fejl: Node.js er ikke installeret. Download det på https://nodejs.org"
  exit 1
fi

echo "Node.js $(node --version) fundet"

# Install dependencies
echo ""
echo "Installerer dependencies..."
npm install

# Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env oprettet fra .env.example"
fi

# Setup database
echo ""
echo "Opsætter database..."
npm run db:push

# Done
echo ""
echo "================================================"
echo " Alt er klar! Start serveren med:"
echo ""
echo "   npm run dev"
echo ""
echo " Åbn derefter: http://localhost:3000"
echo "================================================"
