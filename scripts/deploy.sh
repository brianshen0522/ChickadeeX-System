#!/bin/bash

# Medical Reports Platform - Production Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
PROJECT_NAME="medical-reports"

echo "🚀 Deploying Medical Reports Platform to $ENVIRONMENT..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Utility functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        exit 1
    fi
    
    if [[ ! -f ".env" ]]; then
        log_error ".env file not found. Please copy .env.example and configure it."
        exit 1
    fi
    
    log_info "Prerequisites check passed ✓"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p logs
    mkdir -p backups
    mkdir -p nginx/ssl
    mkdir -p backend/uploads
    
    log_info "Directories created ✓"
}

# Generate SSL certificates (self-signed for development)
generate_ssl_certs() {
    if [[ ! -f "nginx/ssl/server.crt" ]]; then
        log_info "Generating SSL certificates..."
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/server.key \
            -out nginx/ssl/server.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        
        log_info "SSL certificates generated ✓"
    else
        log_info "SSL certificates already exist ✓"
    fi
}

# Build and start services
deploy_services() {
    log_info "Building and starting services..."
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        docker-compose -f docker-compose.prod.yml down || true
        docker-compose -f docker-compose.prod.yml pull
        docker-compose -f docker-compose.prod.yml build --no-cache
        docker-compose -f docker-compose.prod.yml up -d
    else
        docker-compose down || true
        docker-compose pull
        docker-compose build --no-cache
        docker-compose up -d
    fi
    
    log_info "Services deployed ✓"
}

# Wait for services to be healthy
wait_for_services() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if docker-compose ps | grep -q "Up (healthy)"; then
            log_info "Services are healthy ✓"
            return 0
        fi
        
        log_warn "Waiting for services... (attempt $((attempt + 1))/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    log_error "Services failed to become healthy"
    docker-compose logs
    exit 1
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Wait for database to be ready
    sleep 15
    
    # Migrations are applied during container startup via init.sql
    log_info "Database migrations completed ✓"
}

# Display deployment information
show_deployment_info() {
    log_info "Deployment completed successfully! 🎉"
    echo ""
    echo "=== Access Information ==="
    echo "Frontend:     http://localhost (or your domain)"
    echo "Backend API:  http://localhost/api"
    echo "Keycloak:     http://localhost:8080"
    echo ""
    echo "=== Admin User ==="
    echo "The first user who signs in via Keycloak becomes admin automatically if no admin exists."
    echo ""
    echo "=== Service Status ==="
    docker-compose ps
    echo ""
    echo "=== Useful Commands ==="
    echo "View logs:    docker-compose logs -f [service]"
    echo "Restart:      docker-compose restart [service]"
    echo "Scale:        docker-compose up -d --scale backend=3"
    echo "Backup DB:    ./scripts/backup.sh"
    echo ""
    log_warn "Please change default passwords in production!"
}

# Main deployment flow
main() {
    echo "🏥 Medical Reports Platform Deployment"
    echo "========================================"
    echo ""
    
    check_prerequisites
    create_directories
    generate_ssl_certs
    deploy_services
    wait_for_services
    run_migrations
    show_deployment_info
    
    log_info "Deployment script completed successfully!"
}

# Handle script interruption
trap 'log_error "Deployment interrupted!"; exit 1' INT TERM

# Run main function
main "$@"
