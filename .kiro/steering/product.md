# Product Overview

## NoEatToStop System (食べてなかったら止まるシステム)

A smart monitoring system that controls TV power based on children's eating behavior during meals. The system uses computer vision to detect when a child stops eating and automatically turns off the TV to encourage focus on the meal.

## Core Functionality

- **Real-time eating detection**: Uses camera feed to monitor eating behavior
- **Automatic TV control**: Turns TV off when eating stops, on when eating resumes
- **Meal session tracking**: Records eating patterns and meal duration
- **Web dashboard**: Provides monitoring interface and system configuration

## Target Users

Parents who want to encourage their children to focus on eating during meals rather than being distracted by television.

## Key Components

- Edge device with camera (Raspberry Pi or development on macOS)
- AWS cloud infrastructure for video processing and AI analysis
- Web application for monitoring and configuration (Cognito 認証必須)
- TV control interface for external system integration
- Real-time status monitoring and request tracking