/**
 * Studio apps are plain HTML/CSS/JS with no packages. Models (small ones especially) often fill the
 * `dependencies` field with things that are not packages; only real package names count, and those
 * become a revision note for the Coder instead of ending the run. Shared by the server and PLAY LIVE.
 */
const NOT_PACKAGES = /^(none|n\/a|no(ne)?( external)? dependencies|html ?5?|css ?3?|javascript|js|es20\d\d|es\d|vanilla( js| javascript)?|plain (js|javascript)|dom|browser|web ?apis?|canvas( api)?|local ?storage|requestanimationframe)$/i;

export function unsupportedDependencies(list: readonly string[] = []): string[] {
  return list.map((item) => item.trim()).filter((item) => item && !NOT_PACKAGES.test(item));
}

export const dependencyNote = (dependencies: readonly string[]) =>
  `Unsupported dependencies: ${dependencies.join(', ')}. Use only plain HTML, CSS and JavaScript with no packages, CDNs or imports, and return "dependencies": [].`;
