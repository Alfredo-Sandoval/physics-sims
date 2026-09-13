import * as CONSTANTS from "./config.js";

const format = (level, context, args) => {
  const prefix = context ? `[${context}]` : "[SolarSystem]";
  return [prefix, ...args];
};

export const debug = (context, ...args) => {
  if (!CONSTANTS.DEBUG) return;
  console.debug(...format("debug", context, args));
};

export const info = (context, ...args) => {
  if (!CONSTANTS.DEBUG) return;
  console.info(...format("info", context, args));
};

export const warn = (context, ...args) => {
  console.warn(...format("warn", context, args));
};

export const error = (context, ...args) => {
  console.error(...format("error", context, args));
};
