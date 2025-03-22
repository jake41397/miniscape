#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape - Stopping Development Environment"
echo "=========================================="

# Function to check if a command executed successfully
check_success() {
    if [ $? -eq 0 ]; then
        echo "✅ Success: $1"
    else
        echo "❌ Failed: $1"
    fi
}

# Stop development PM2 processes
echo "Stopping development PM2 processes..."
pm2 stop miniscape-dev-frontend miniscape-dev-backend
check_success "Stopping development processes"

echo "=========================================="
echo "Development environment has been stopped!"
echo "Use 'pm2 status' to verify"
echo "=========================================="

# Display PM2 status
pm2 status 