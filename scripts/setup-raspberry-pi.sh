#!/bin/bash

# Raspberry Pi 3B Setup Script for NoEatToStop System
set -e

echo "Setting up Raspberry Pi 3B for NoEatToStop System..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3-pip nodejs npm git cmake build-essential

# Install OpenCV
sudo apt install -y python3-opencv

# Install AWS IoT Greengrass
wget https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-nucleus-latest.zip
unzip greengrass-nucleus-latest.zip -d GreengrassCore
sudo java -Droot="/greengrass/v2" -Dlog.store=FILE -jar ./GreengrassCore/lib/Greengrass.jar \
    --aws-region ap-northeast-1 \
    --thing-name NoEatToStopDevice \
    --thing-group-name NoEatToStopGroup \
    --component-default-user ggc_user:ggc_group \
    --provision true \
    --setup-system-service true

# Setup camera
echo "bcm2835-v4l2" | sudo tee -a /etc/modules

# Create application directory
sudo mkdir -p /opt/no-eat-to-stop
sudo chown pi:pi /opt/no-eat-to-stop

# Install Python dependencies
pip3 install opencv-python boto3 awsiotsdk

echo "Raspberry Pi setup completed!"
echo "Please configure AWS credentials and device certificates."
