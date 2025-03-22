#!/bin/bash

# Script to reload NGINX and restart both environments

# Display banner
echo "=========================================="
echo "   MiniScape - Reloading Environments"
echo "=========================================="

# Reload NGINX configuration
echo "Reloading NGINX configuration..."
sudo nginx -t && sudo systemctl reload nginx

# Check PM2 process status
echo "Current PM2 processes before reload:"
pm2 status

# Reload PM2 processes (zero downtime reload)
echo "Reloading all PM2 processes..."
pm2 reload all

echo "=========================================="
echo "Environments reloaded successfully!"
echo ""
echo "DEVELOPMENT:"
echo "- Frontend: https://dev.miniscape.io (port 3001)"
echo "- Backend: https://dev.miniscape.io/api (port 4001)"
echo ""
echo "PRODUCTION:"
echo "- Frontend: https://miniscape.io (port 3000)"
echo "- Backend: https://miniscape.io/api (port 5000)"
echo "=========================================="

# Display PM2 status after reload
echo "Current PM2 processes after reload:"
pm2 status 