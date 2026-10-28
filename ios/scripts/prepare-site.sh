#!/bin/sh
# Xcode bundles the same publication output as Pages, with a native-only adapter.
set -eu
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  pocket_nvm_dir=${NVM_DIR:-$HOME/.nvm}
  if [ -s "$pocket_nvm_dir/nvm.sh" ]; then
    . "$pocket_nvm_dir/nvm.sh"
    nvm use --silent 22
  fi
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  echo 'Node 22+ is required. Install Node 22 or nvm with Node 22, then reopen Xcode.' >&2
  exit 1
fi
cd "$(dirname "$0")/../.."
site_destination=${1:?Usage: prepare-site.sh /absolute/output/Site}
if [ ! -d gym/node_modules ]; then
  echo 'Install the Gym build dependencies first: npm --prefix gym ci' >&2
  exit 1
fi
npm --prefix gym exec -- vite build
sh scripts/assemble-site.sh "$site_destination"
node ios/scripts/prepare-bundle.mjs "$site_destination"
