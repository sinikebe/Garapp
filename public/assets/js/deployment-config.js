/** Replaced in published Cloudflare builds; legacy Pages keeps path-based routing. */
export const DEPLOYMENT = Object.freeze({ environment: 'legacy', suite: null });

export function deploymentFor(base, config = DEPLOYMENT) {
  const environment = config.environment === 'main' || config.environment === 'dev'
    ? config.environment : new URL('./', base).pathname.endsWith('/dev/') ? 'dev' : 'main';
  return { environment, development: environment === 'dev' };
}

/** Keep old keys on GitHub Pages; separate branch-root deployments if origins overlap. */
export function deploymentStoragePath(base, config = DEPLOYMENT) {
  const path = new URL('./', base).pathname;
  return config.environment === 'dev' && !path.endsWith('/dev/') ? `dev:${path}` : path;
}
