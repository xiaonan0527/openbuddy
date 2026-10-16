#!/bin/zsh
set -eu
app_dir="${0:A:h}/release-final/mac-arm64/OpenBuddy.app"
if [[ ! -d "$app_dir" ]]; then
  print '请先在项目目录执行 npm run package:mac。'
  exit 1
fi
/usr/bin/open "$app_dir"
