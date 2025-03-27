# BASS_ERROR_TIMEOUT Fix

This document outlines the changes made to address the widespread `BASS_ERROR_TIMEOUT` issue in the Relisten mobile app.

## Problem

The app was generating a large number of Sentry error reports (117,000+) related to `BASS_ERROR_TIMEOUT`, affecting over 14,700 users. This error occurs when the BASS audio library fails to connect to streaming audio servers within the configured timeout period.

## Changes Made

### 1. Enhanced Logging System

Created a custom logging module (`/relisten/util/logging-enhanced.ts`) that:
- Throttles `BASS_ERROR_TIMEOUT` errors to reduce Sentry noise
- Groups similar errors by user and tracks occurrence frequency
- Collects network information to better diagnose issues
- Provides specialized audio stream logging functions

### 2. Improved Native Player Error Handling

Updated the BASS audio player implementation (`BASSLifecycle-enhanced.swift`) to:
- Increase timeout from 15 to 30 seconds for slower connections
- Add automatic retry with exponential backoff for failed connections
- Monitor network connectivity and handle reconnection seamlessly
- Enhance error reporting with more detailed diagnostics

### 3. Player Component with Smart Retry Logic

Modified the player hooks (`relisten_player_hooks.tsx`) to:
- Track retry attempts per stream to prevent endless retry loops
- Implement exponential backoff for retries
- Monitor network status and adapt playback behavior accordingly
- Provide detailed context for error logging

### 4. Sentry Filtering

Updated Sentry configuration to:
- Filter out repetitive BASS timeout errors that are now handled by our enhanced system
- Ensure critical errors still get reported
- Provide better context for debugging

## Testing

To test these changes:
1. Try playing streams on slow connections
2. Test with network interruptions
3. Verify error logs contain sufficient diagnostic information
4. Confirm Sentry is not flooded with duplicate timeout errors

## Future Improvements

Consider further enhancements:
- Add user-facing notifications for persistent connection issues
- Implement fallback audio sources for popular tracks
- Add adaptive quality settings based on connection speed
- Introduce offline caching preferences to reduce streaming issues
