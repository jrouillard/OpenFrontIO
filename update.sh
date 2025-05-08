#!/bin/bash
# update.sh - Script to update Docker container on Hetzner server
# Called by deploy.sh after uploading Docker image to Docker Hub

# Load environment variables if .env exists
if [ -f /home/openfront/.env ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' /home/openfront/.env | xargs)
fi

echo "======================================================"
echo "🔄 UPDATING SERVER: ${HOST} ENVIRONMENT"
echo "======================================================"


# Container and image configuration
CONTAINER_NAME="openfront-${ENV}-${SUBDOMAIN}"

echo "Pulling ${DOCKER_IMAGE} from Docker Hub..."
docker pull $DOCKER_IMAGE

echo "Checking for existing container..."
# Check for running container
RUNNING_CONTAINER=$(docker ps | grep ${CONTAINER_NAME} | awk '{print $1}')
if [ -n "$RUNNING_CONTAINER" ]; then
  echo "Stopping running container $RUNNING_CONTAINER..."
  docker stop $RUNNING_CONTAINER
  echo "Waiting for container to fully stop and release resources..."
  sleep 5  # Add a 5-second delay
  docker rm $RUNNING_CONTAINER
  echo "Container $RUNNING_CONTAINER stopped and removed."
fi

# Also check for stopped containers with the same name
STOPPED_CONTAINER=$(docker ps -a | grep ${CONTAINER_NAME} | awk '{print $1}')
if [ -n "$STOPPED_CONTAINER" ]; then
  echo "Removing stopped container $STOPPED_CONTAINER..."
  docker rm $STOPPED_CONTAINER
  echo "Container $STOPPED_CONTAINER removed."
fi

echo "Starting new container for ${HOST} environment..."
docker run -d \
  --restart=always \
  --env-file /home/openfront/.env \
  --name ${CONTAINER_NAME} \
  $DOCKER_IMAGE

if [ $? -eq 0 ]; then
  echo "Update complete! New ${CONTAINER_NAME} container is running."
  
  # Final cleanup after successful deployment
  echo "Performing final cleanup of unused Docker resources..."
  echo "Removing unused images (not referenced)..."
  docker image prune -a -f
  docker container prune -f
  echo "Cleanup complete."
else
  echo "Failed to start container"
  exit 1
fi

echo "======================================================"
echo "✅ SERVER UPDATE COMPLETED SUCCESSFULLY"
echo "Container name: ${CONTAINER_NAME}"
echo "Image: ${FULL_IMAGE_NAME}"
echo "======================================================"