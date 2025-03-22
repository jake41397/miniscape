#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape - Stopping All Environments"
echo "=========================================="

# Function to check if a command executed successfully
check_success() {
    if [ $? -eq 0 ]; then
        echo "✅ Success: $1"
    else
        echo "❌ Failed: $1"
    fi
}

# Stop all PM2 processes
echo "Stopping all PM2 processes..."
pm2 stop all
check_success "Stopping all PM2 processes"

echo "=========================================="
echo "All environments have been stopped!"
echo "Use 'pm2 status' to verify"
echo "=========================================="

# Display PM2 status
pm2 status 