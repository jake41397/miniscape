#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape - Stopping Production Environment"
echo "=========================================="

# Function to check if a command executed successfully
check_success() {
    if [ $? -eq 0 ]; then
        echo "✅ Success: $1"
    else
        echo "❌ Failed: $1"
    fi
}

# Stop production PM2 processes
echo "Stopping production PM2 processes..."
pm2 stop miniscape-prod-frontend miniscape-prod-backend
check_success "Stopping production processes"

echo "=========================================="
echo "Production environment has been stopped!"
echo "Use 'pm2 status' to verify"
echo "=========================================="

# Display PM2 status
pm2 status 