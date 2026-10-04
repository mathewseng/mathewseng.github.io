#!/bin/sh
# The same assembly is used locally, in artifact tests, and on GitHub Pages.
set -eu
site_target=${1:-_site}
mkdir -p "$site_target"
rsync -a --delete \
  --exclude '.git' --exclude '.github' --exclude '.openai' \
  --exclude '_site' --exclude 'gym' --exclude 'jazz-piano-ml' \
  --exclude 'node_modules' --exclude 'redirects.json' \
  --exclude 'package.json' --exclude 'package-lock.json' \
  --exclude '.gitignore' --exclude '.DS_Store' --exclude '*.md' \
  --exclude 'scripts' --exclude 'simulation' \
  --include '/backgammon/solver/' --exclude 'solver' --exclude 'tests' \
  ./ "$site_target/"
if [ -d gym/dist ]; then
  mkdir -p "$site_target/gym"
  cp -R gym/dist/. "$site_target/gym/"
fi
touch "$site_target/.nojekyll"
node scripts/build-redirects.mjs "$site_target"
