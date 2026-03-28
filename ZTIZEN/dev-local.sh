#!/bin/bash
# Local Development Helper Script
# Manages Docker databases while running services locally

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 ZTIZEN Local Development Setup${NC}"
echo ""

# Function to check if port is in use
check_port() {
    lsof -i ":$1" > /dev/null 2>&1
    return $?
}

# Function to start only databases
start_databases() {
    echo -e "${YELLOW}📦 Starting Docker databases...${NC}"
    docker-compose up -d ztizen-db ztizen-product-db

    echo -e "${YELLOW}⏳ Waiting for databases to be healthy...${NC}"
    sleep 5

    docker-compose ps ztizen-db ztizen-product-db
    echo ""
}

# Function to stop API services (free ports)
stop_api_services() {
    echo -e "${YELLOW}🛑 Stopping Docker API services (to free ports 5502/5503)...${NC}"
    docker-compose stop ztizen-api ztizen-product-api 2>/dev/null || true
    echo ""
}

# Function to check port status
check_ports() {
    echo -e "${YELLOW}🔍 Checking port availability...${NC}"

    ports=("5501:Frontend" "5502:ZTIZEN API" "5503:Product API" "5504:ZTIZEN DB" "5505:Product DB")

    for port_info in "${ports[@]}"; do
        IFS=':' read -r port name <<< "$port_info"
        if check_port $port; then
            echo -e "  ${RED}✗${NC} Port $port ($name) - ${RED}IN USE${NC}"
        else
            echo -e "  ${GREEN}✓${NC} Port $port ($name) - ${GREEN}Available${NC}"
        fi
    done
    echo ""
}

# Main execution
case "${1:-setup}" in
    setup)
        echo "Setting up local development environment..."
        echo ""

        # Start databases
        start_databases

        # Stop API services
        stop_api_services

        # Check port status
        check_ports

        echo -e "${GREEN}✅ Setup complete!${NC}"
        echo ""
        echo "Now you can run services locally:"
        echo "  Terminal 1: cd service-ztizen && pnpm dev"
        echo "  Terminal 2: cd service-product && pnpm dev"
        echo "  Terminal 3: cd web && pnpm dev"
        ;;

    check)
        check_ports
        ;;

    cleanup)
        echo -e "${YELLOW}🧹 Cleaning up...${NC}"
        docker-compose stop ztizen-api ztizen-product-api
        echo -e "${GREEN}✓${NC} API services stopped"
        echo ""
        echo "Databases still running. To stop them:"
        echo "  docker-compose down"
        ;;

    *)
        echo "Usage: $0 {setup|check|cleanup}"
        echo ""
        echo "Commands:"
        echo "  setup   - Start databases, stop API services, check ports"
        echo "  check   - Check port availability"
        echo "  cleanup - Stop API services but keep databases running"
        exit 1
        ;;
esac
