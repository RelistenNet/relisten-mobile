# Local API Development Config

Relisten mobile now has separate API bases for catalog reads and user-library calls.

## iOS Simulator

Set these before starting Metro to point the simulator at local API servers:

```sh
EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL=http://localhost:3823/api \
EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL=http://localhost:5119 \
npx expo start --dev-client
```

The catalog client still owns catalog ETag and rate-limit behavior. The user-library client uses `/api/v3/library` paths against its own base URL and sends no-store request headers by default.

The non-UI probe helper `runLocalApiBaseUrlProbe` in `relisten/api/local_api_probe.ts` can be used from a development-only caller once both local servers are running. It checks:

- catalog: `GET /v3/artists?include_autocreated=false`
- user-library: `GET /health`
