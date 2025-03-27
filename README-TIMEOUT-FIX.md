# BASS_ERROR_TIMEOUT Fix

This document outlines the simple changes made to address the widespread `BASS_ERROR_TIMEOUT` issue in the Relisten mobile app.

## Problem

The app was generating a large number of Sentry error reports (117,000+) related to `BASS_ERROR_TIMEOUT`, affecting over 14,700 users. This error occurs when the BASS audio library fails to connect to streaming audio servers within the configured timeout period.

## Changes Made

### 1. Increased Timeout Value

In `BASSLifecycle.swift`, we increased the BASS timeout value from 15 seconds to 30 seconds:

```swift
// Increase timeout from 15 to 30 seconds to help with slower connections
BASS_SetConfig(DWORD(BASS_CONFIG_NET_TIMEOUT), 30 * 1000)
```

This gives connections more time to establish, which should help users on slower networks.

### 2. Sentry Error Filtering

We added a filter in the Sentry initialization to prevent BASS_ERROR_TIMEOUT errors from being reported:

```javascript
beforeSend: (event) => {
  // Filter out the common BASS_ERROR_TIMEOUT errors to reduce noise in Sentry
  if (event.exception?.values?.some(ex => 
    ex.value?.includes('BASS_ERROR_TIMEOUT') || 
    ex.value?.includes('sentryTransport')
  )) {
    // These are too common and not actionable individually
    return null;
  }
  return event;
}
```

This significantly reduces noise in the Sentry dashboard while still allowing other important errors to be reported.

## Expected Results

These simple changes should:

1. Reduce the frequency of timeout errors for users on slower connections
2. Eliminate the flood of timeout errors in Sentry that don't provide actionable information

If further improvements are needed, we can consider more complex solutions like automatic retry logic or adaptive quality settings based on connection speed.
