import { registerRootComponent } from 'expo';

import App from './App';

// ARCH-DECISION: Local entry point instead of expo's built-in AppEntry.js.
// AppEntry.js does `import App from '../../App'` — a path relative to its own
// location, which only lands on apps/mobile/App when expo lives in
// apps/mobile/node_modules. This monorepo uses node-linker=hoisted (required for
// the Android build), so expo resolves to the workspace-root node_modules and
// '../../App' points outside the repo → Metro fails with "Unable to resolve
// module ../../App". Registering the root component here keeps the entry local
// and layout-independent.
registerRootComponent(App);
