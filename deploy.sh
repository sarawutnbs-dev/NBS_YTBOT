#!/bin/bash
set -e

# Configuration
REGISTRY_URL="registry.nbsi.me"
REGISTRY_USER="admin"
REGISTRY_PASS="Rg@2024!SecureP@ssw0rd#Nbsi\$Docker%Registry^"
IMAGE_NAME="nbsbot"
IMAGE_TAG="latest"
SERVER_HOST="45.91.134.109"
SERVER_USER="root"
DEPLOY_PATH="/opt/nbsbot"

echo "=== Building Docker Image ==="
docker build -t ${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_TAG} .

echo ""
echo "=== Logging in to Registry ==="
echo "${REGISTRY_PASS}" | docker login ${REGISTRY_URL} -u ${REGISTRY_USER} --password-stdin

echo ""
echo "=== Pushing Image to Registry ==="
docker push ${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_TAG}

echo ""
echo "=== Deploying to Server ==="
ssh ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
  set -e
  
  # Create deploy directory
  mkdir -p /opt/nbsbot
  cd /opt/nbsbot
  
  # Check if .env.production exists
  if [ ! -f .env.production ]; then
    echo "ERROR: .env.production not found in /opt/nbsbot"
    echo "Please create it first with required environment variables"
    exit 1
  fi
  
  # Login to registry
  echo "Rg@2024!SecureP@ssw0rd#Nbsi\$Docker%Registry^" | docker login registry.nbsi.me -u admin --password-stdin
  
  # Pull latest image
  docker pull registry.nbsi.me/nbsbot:latest
  
  # Stop and remove old containers if exist
  docker compose -f docker-compose.prod.yml down 2>/dev/null || true
  
  # Start services
  docker compose -f docker-compose.prod.yml up -d
  
  echo ""
  echo "=== Deployment Complete ==="
  echo "Checking container status..."
  sleep 5
  docker compose -f docker-compose.prod.yml ps
ENDSSH

echo ""
echo "=== Deployment finished! ==="
echo "Check logs with: ssh ${SERVER_USER}@${SERVER_HOST} 'cd /opt/nbsbot && docker compose -f docker-compose.prod.yml logs -f'"
