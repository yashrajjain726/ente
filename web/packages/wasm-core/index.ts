// The wrappers in this package load the wasm module lazily, but the wasm
// calls themselves run synchronously on the calling thread. Invoke heavy
// operations from a Web Worker to avoid freezing the UI.
export * from "./blob";
export * from "./secretbox";
export * from "./types";
