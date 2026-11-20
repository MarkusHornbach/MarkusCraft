// The build id (`__BUILD_COMMIT__`): the commit a build was made from. Used by vite.config.ts.

/**
 * `BUILD_COMMIT` if set (a Pi build from an archive has no `.git`), else `GITHUB_SHA`, else
 * the checkout's HEAD; seven characters, or `dev` when nothing is known.
 */
export function buildCommit(
  env: Readonly<Record<string, string | undefined>>,
  gitHead: () => string | null,
): string {
  const clean = (value: string | null | undefined): string => {
    const text = (value ?? '').trim();
    return /^[A-Za-z0-9]+$/.test(text) ? text.slice(0, 7) : '';
  };
  return clean(env.BUILD_COMMIT) || clean(env.GITHUB_SHA) || clean(gitHead()) || 'dev';
}
