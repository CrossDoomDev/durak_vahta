# Publication and updates

- Work on the development sources in `src/`. `src/shell.html` is the HTML template.
- GitHub Pages publishes the repository root using its existing Pages deployment. It does not run the Node build automatically.
- After changing code, styles, assets, templates, or the package version, run `npm run build` before committing. Commit the generated root `index.html`, `index-*.html`, `version.json`, `sw.js`, `.nojekyll`, and `public/build/` changes together with the sources. Never hand-edit these generated files.
- Keep the version check, immutable release HTML/JS/CSS names, and network-first navigation. Offline fallback must use a coherent installed release. Do not clear localStorage to repair a cache problem.
- Use `npm run test:cache` for changes to loading, build output, service workers, or update handling. The test covers a legacy cache-first worker, stale HTML/HTTP caching, an ordinary refresh to a newer release, exact saved-game preservation, and offline reload.
- Keep the visible release version in the menu. A successful git push alone does not establish that GitHub Pages deployed it: inspect the matching Pages workflow run before reporting deployment success.
