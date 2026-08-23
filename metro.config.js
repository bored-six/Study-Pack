const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WebAssembly build (wa-sqlite) for the web target.
// Metro doesn't treat .wasm as an asset by default, so the import in
// expo-sqlite/web/worker.ts fails to resolve without this.
config.resolver.assetExts.push('wasm');

// wa-sqlite's OPFS-backed storage needs SharedArrayBuffer, which browsers
// only expose to cross-origin-isolated pages.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
