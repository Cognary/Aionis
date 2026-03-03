#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_LINKS="$(mktemp -t aionis-doc-links.XXXXXX)"
trap 'rm -f "$TMP_LINKS"' EXIT

FILES=(
  "README.md"
  "docs/index.md"
  "docs/README.md"
  "src/jobs/README.md"
)

while IFS= read -r file; do
  FILES+=("$file")
done < <(find docs/public -type f -name "*.md" | sort)

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
' "${FILES[@]}" > "$TMP_LINKS"

resolve_candidate_exists() {
  local base="$1"
  if [[ -e "$base" ]]; then
    return 0
  fi
  if [[ -e "${base}.md" ]]; then
    return 0
  fi
  if [[ -e "${base}/index.md" ]]; then
    return 0
  fi
  return 1
}

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
    resolved="$ROOT_DIR/docs$target"
  else
    src_dir="$(dirname "$src")"
    if [[ "$src_dir" == "." ]]; then
      resolved="$ROOT_DIR/$target"
    else
      resolved="$ROOT_DIR/$src_dir/$target"
    fi
  fi

  if ! resolve_candidate_exists "$resolved"; then
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

EN_PUBLIC_DIR="$ROOT_DIR/docs/public/en"
ZH_PUBLIC_DIR="$ROOT_DIR/docs/public/zh"

missing_mirror=0
extra_mirror=0

while IFS= read -r en_file; do
  rel="${en_file#$EN_PUBLIC_DIR/}"
  zh_file="$ZH_PUBLIC_DIR/$rel"
  if [[ ! -f "$zh_file" ]]; then
    echo "MISSING ZH MIRROR: docs/public/zh/$rel (for docs/public/en/$rel)"
    missing_mirror=$((missing_mirror + 1))
  fi
done < <(find "$EN_PUBLIC_DIR" -type f -name "*.md" | sort)

while IFS= read -r zh_file; do
  rel="${zh_file#$ZH_PUBLIC_DIR/}"
  en_file="$EN_PUBLIC_DIR/$rel"
  if [[ ! -f "$en_file" ]]; then
    echo "EXTRA ZH PAGE WITHOUT EN SOURCE: docs/public/zh/$rel"
    extra_mirror=$((extra_mirror + 1))
  fi
done < <(find "$ZH_PUBLIC_DIR" -type f -name "*.md" | sort)

if [[ $missing_mirror -gt 0 || $extra_mirror -gt 0 ]]; then
  echo "docs-check: failed (${missing_mirror} missing zh mirror, ${extra_mirror} extra zh page)"
  exit 1
fi

echo "docs-check: ok"
