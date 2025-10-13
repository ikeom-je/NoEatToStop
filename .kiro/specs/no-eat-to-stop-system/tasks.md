# Implementation Plan

- [x] 1. Set up project structure and core CDK infrastructure
  - Create CDK project structure with TypeScript
  - Define core AWS resources (VPC, IAM roles, S3 buckets)
  - Set up environment-specific configurations (dev/prod)
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 2. Implement DynamoDB data models and access patterns
  - [x] 2.1 Create DynamoDB table definitions in CDK
    - Define MealSessions table with performance metrics and children count tracking
    - Define EatingStates table with chewing detection metadata and error flags
    - Define SystemSettings table with comprehensive configuration parameters
    - Add GSI for time-based queries and error analysis
    - _Requirements: 3.1, 3.2, 3.6, 7.3_

  - [x] 2.2 Implement data access layer with TypeScript interfaces
    - Create enhanced TypeScript interfaces for MealSession, EatingState, SystemConfiguration
    - Implement DynamoDB repository classes with CRUD operations for all settings
    - Add data validation for all configurable parameters (thresholds, durations, counts)
    - Implement error flag management for manual error correction
    - _Requirements: 3.1, 3.2, 4.3, 4.7_

  - [x] 2.3 Write unit tests for data access layer
    - Create unit tests for DynamoDB operations including new fields
    - Mock DynamoDB client for isolated testing
    - Test error scenarios and configuration validation
    - _Requirements: 3.1, 3.2_

- [ ] 3. Set up Kinesis Video Streams and S3 video storage
  - [x] 3.1 Create KVS stream and S3 bucket in CDK
    - Define KVS stream with configurable retention (default 1 day)
    - Create S3 bucket with lifecycle policies for 1-day video retention
    - Set up separate S3 storage for judgment images/videos for error analysis
    - Set up IAM permissions for KVS and S3 access with management screen access control
    - _Requirements: 3.2, 3.3, 3.5, 3.6_

  - [x] 3.2 Implement video streaming utilities
    - Create KVS producer client for edge device with configurable resolution (default 640x360/30fps)
    - Implement S3 upload functionality for video segments and judgment data
    - Add error handling for network disconnection (continue edge-only processing)
    - Implement configurable video buffer duration (default 10 seconds)
    - _Requirements: 3.1, 3.3, 6.3_

- [ ] 4. Develop cloud-based video processing Lambda functions
  - [x] 4.1 Create video processing Lambda function
    - Implement KVS consumer to receive video streams with configurable analysis duration (default 20 seconds)
    - Add frame extraction logic from video segments for chewing analysis
    - Create integration with Amazon Rekognition for face and mouth detection
    - Implement multiple children detection and adult exclusion logic
    - _Requirements: 2.2, 2.3, 2.5_

  - [x] 4.2 Integrate Amazon Bedrock for advanced chewing analysis
    - Set up Bedrock client with Claude model access prioritized over edge processing
    - Implement prompt engineering for chewing behavior analysis with configurable parameters
    - Add confidence scoring and decision logic with 80% default threshold
    - Implement automatic error recovery for misdetections
    - _Requirements: 2.2, 2.4_

  - [x] 4.3 Implement state management and DynamoDB integration
    - Create functions to update meal session states with chewing duration tracking
    - Implement chewing state history tracking with TV control count
    - Add business logic for state transitions based on chewing stop threshold (default 10 seconds)
    - Store judgment images/videos for error analysis
    - _Requirements: 1.2, 1.4, 1.5, 3.6_

  - [ ]* 4.4 Write integration tests for video processing
    - Create test video samples for chewing scenarios with multiple children
    - Test Rekognition and Bedrock integration with adult exclusion
    - Validate state transition logic with configurable thresholds
    - _Requirements: 2.2, 2.3, 2.4_

- [ ] 5. Build IoT Greengrass edge processing components
  - [x] 5.1 Create Local Lambda function for edge processing
    - Implement computer vision with OpenCV for face detection (configurable threshold)
    - Add mouth position detection and chewing motion analysis (configurable thresholds)
    - Create meal start detection (dish placement + eating motion) and meal end detection (dish cleanup)
    - Implement multiple children tracking with configurable child count
    - Add adult detection exclusion with ON/OFF setting
    - Implement 10-second video buffer with configurable duration
    - _Requirements: 2.1, 1.1, 1.2, 1.3, 2.5_

  - [x] 5.2 Implement TV control interface module
    - Create TV control interface for external system integration
    - Implement mock TV control service for testing and development
    - Add TV control manager for request tracking and status management
    - Implement TV control status monitoring for management interface
    - Add error handling and retry mechanism for TV control failures
    - _Requirements: 1.3, 1.4, 6.4, 6.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 5.3 Set up Greengrass deployment configuration
    - Create Greengrass component definitions for Raspberry Pi 3B
    - Configure local Lambda deployment settings with IoT Greengrass experience
    - Set up device certificates and permissions for remote control and management
    - _Requirements: 2.1, 5.4_

  - [x]* 5.4 Create edge processing and TV control integration tests
    - Mock 1080P/30frame USB camera input for testing
    - Test TV control interface functionality with mock service
    - Validate TV control request tracking and status management
    - Test integration between meal state manager and TV control interface
    - Verify TV control interface calls when chewing stops are detected
    - _Requirements: 2.1, 1.3, 1.4, 8.1, 8.2, 8.3, 8.4_

- [ ] 6. Develop Vue.js web management interface
  - [x] 6.1 Set up Vue.js project with Tailwind CSS
    - Initialize Vue 3 project with Composition API
    - Configure Tailwind CSS and component structure
    - Set up Pinia for state management and Vue Router
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Create comprehensive UI components
    - Build LiveVideo component for real-time video display (3-second interval, configurable)
    - Implement MealHistory component for chewing time and TV control count statistics
    - Create SystemSettings component for all configurable parameters (thresholds, durations, counts, detection settings)
    - Build Dashboard component with overview metrics
    - Create EmergencyControl component for manual system stop and camera/cloud transmission control
    - Implement ErrorAnalysis component for manual error flag input and judgment data review
    - Build TVControlStatus component for TV control request monitoring and status display
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.3 Implement comprehensive API integration services
    - Create API service layer for DynamoDB operations with all new data fields
    - Add WebSocket service for real-time updates with 3-second interval
    - Implement authentication and error handling for management ID access control
    - Create emergency control service for manual system operations
    - Add error analysis service for judgment data management
    - Implement TV control status service for request monitoring and history display
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.4 Set up S3 static hosting and CloudFront distribution
    - Configure S3 bucket for static website hosting
    - Create CloudFront distribution with SPA support (404→index.html)
    - Set up automated build and deployment pipeline with API URL injection
    - Create deployment scripts for frontend-only and full deployment
    - _Requirements: 4.1, 4.2_

  - [x] 6.5 Write component tests for Vue.js application
    - Create unit tests for Vue components including new settings and emergency controls
    - Test API integration and state management with comprehensive parameters
    - Add E2E tests with Cypress for all management functions
    - Implement Cognito authentication for simple access control
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Implement monitoring and analytics with IoT Greengrass integration
  - [x] 7.1 Set up comprehensive logging and metrics
    - Configure logging for device-side and cloud-side processing and judgment states
    - Create custom metrics for performance measurement (meal start/end detection, face/mouth/chewing detection accuracy, TV control success rate)
    - Set up alarms for critical errors only (system processing critical errors)
    - Implement IoT Greengrass logging integration for system completion assessment
    - _Requirements: 3.4, 7.1, 7.2, 7.3_

  - [x] 7.2 Configure IoT Greengrass monitoring dashboards
    - Create dashboards for real-time system monitoring using IoT Greengrass capabilities
    - Add visualizations for chewing patterns and TV control events
    - Set up alerting rules for critical system errors only
    - _Requirements: 3.4, 7.1_

  - [x] 7.3 Set up performance analytics
    - Create analytics datasets from DynamoDB tables with new performance metrics
    - Build analytical dashboards for meal behavior insights (chewing time, TV control frequency)
    - Add performance tracking for all detection accuracies and system response times
    - Implement extensible design for additional metrics
    - _Requirements: 3.4, 7.3, 7.4_

- [x] 8. Integrate system components and end-to-end testing
  - [x] 8.1 Connect edge device to cloud services with error handling
    - Test KVS streaming from Raspberry Pi 3B to cloud with network disconnection scenarios
    - Validate bidirectional communication between edge and cloud with IoT Greengrass
    - Ensure proper error handling (camera failure: no processing, network failure: edge-only processing)
    - Test TV control retry mechanism (1 retry, 3-second interval)
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Implement complete meal session workflow
    - Create complete meal detection flow (dish placement → eating motion → chewing tracking → dish cleanup)
    - Test TV control based on chewing state changes with immediate OFF control
    - Validate data persistence and state synchronization with all new data fields
    - Test multiple children scenarios with configurable child count
    - Test adult exclusion functionality with ON/OFF settings
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.5_

  - [x] 8.3 Test system with real-world scenarios and performance validation
    - Validate system behavior with actual meal scenarios using prepared video data
    - Test system with real children and adult test scenarios
    - Test edge cases and automatic error recovery
    - Performance testing with 3-second response time target and 1-stream processing
    - Validate all configurable parameters work correctly through management interface
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.4, 7.5_

- [x] 9. Deployment and configuration management
  - [x] 9.1 Create deployment scripts and CI/CD pipeline
    - Set up automated CDK deployment pipeline for AWS infrastructure and application deployment
    - Create environment-specific configuration management
    - Add rollback and monitoring capabilities
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 9.2 Configure Raspberry Pi 3B setup automation
    - Create automated Raspberry Pi 3B configuration scripts
    - Set up IoT Greengrass installation and device registration with remote control capabilities
    - Add 1080P/30frame USB camera setup and Panasonic TV control hardware configuration
    - Configure Alexa integration for voice control fallback
    - _Requirements: 5.4, 2.1_

  - [x] 9.3 Create comprehensive system documentation
    - Write installation and setup documentation for Raspberry Pi 3B and AWS components
    - Create user manual for web management interface with all configuration options
    - Document troubleshooting procedures for camera failures, network issues, and TV control problems
    - Create performance tuning guide for all configurable parameters
    - _Requirements: 4.1, 4.2, 4.3_