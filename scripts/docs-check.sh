#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_LINKS="$(mktemp -t aionis-doc-links.XXXXXX)"
TMP_TARGETS="$(mktemp -t aionis-doc-targets.XXXXXX)"
trap 'rm -f "$TMP_LINKS" "$TMP_TARGETS"' EXIT

perl -ne '
  while (/\[[^\]]*\]\(([^)]+)\)/g) {
    $l = $1;
    next if $l =~ /^https?:/;
    next if $l =~ /^mailto:/;
    next if $l =~ /^#/;
    $l =~ s/#.*$//;
    $l =~ s/\?.*$//;
    next if $l eq "";
    print "$ARGV:$.:$l\n";
  }
' README.md docs/*.md src/jobs/README.md > "$TMP_LINKS"

awk -F: '{print $3}' "$TMP_LINKS" | sort -u > "$TMP_TARGETS"

missing=0
while IFS= read -r target; do
  if [[ "$target" == /* ]]; then
    if [[ ! -e "$target" ]]; then
      echo "MISSING: $target"
      missing=$((missing + 1))
    fi
  else
    if [[ ! -e "$ROOT_DIR/$target" ]]; then
      echo "MISSING: $target"
      missing=$((missing + 1))
    fi
  fi
done < "$TMP_TARGETS"

if [[ $missing -gt 0 ]]; then
  echo "docs-check: failed ($missing missing links)"
  exit 1
fi

echo "docs-check: ok"
