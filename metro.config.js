const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WebAssembly build (wa-sqlite) for the web target.
// Metro doesn't treat .wasm as an asset by default, so the import in
// expo-sqlite/web/worker.ts fails to resolve without this.
config.resolver.assetExts.push('wasm');

// pdf-lib (which counts a PDF's pages before it is sent) depends on tslib,
// and tslib's exports map offers Metro a shim at modules/index.js that opens
// with `import tslib from '../tslib.js'` and destructures the default off it.
// tslib.js is CommonJS with no such default, so the destructure throws while
// the bundle is still being evaluated — which takes the whole app down, not
// just the screen that wanted a page count.
//
// Pointing the name straight at the ES build skips the shim entirely: it has
// the real named exports pdf-lib is asking for.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: require.resolve('tslib/tslib.es6.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// wa-sqlite's OPFS-backed storage needs SharedArrayBuffer, which browsers
// only expose to cross-origin-isolated pages.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
