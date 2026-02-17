#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_LINKS="$(mktemp -t aionis-doc-links.XXXXXX)"
trap 'rm -f "$TMP_LINKS"' EXIT

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

missing=0
while IFS= read -r entry; do
  src="${entry%%:*}"
  rest="${entry#*:}"
  line_no="${rest%%:*}"
  target="${rest#*:}"

  if [[ "$target" == "" ]]; then
    continue
  fi

  if [[ "$target" == /* ]]; then
    resolved="$target"
  else
    src_dir="$(dirname "$src")"
    if [[ "$src_dir" == "." ]]; then
      resolved="$ROOT_DIR/$target"
    else
      resolved="$ROOT_DIR/$src_dir/$target"
    fi
  fi

  if [[ ! -e "$resolved" ]]; then
    if [[ "$target" == /* ]]; then
      echo "MISSING: $target"
    else
      echo "MISSING: $target (from $src:$line_no)"
    fi
    missing=$((missing + 1))
  fi
done < "$TMP_LINKS"

if [[ $missing -gt 0 ]]; then
  echo "docs-check: failed ($missing missing links)"
  exit 1
fi

echo "docs-check: ok"
