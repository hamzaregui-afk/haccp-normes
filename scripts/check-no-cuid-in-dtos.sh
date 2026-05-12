#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-no-cuid-in-dtos.sh
#
# Fails if any input DTO / shared-validators file uses z.string().cuid().
#
# WHY THIS EXISTS:
#   In production we seed tenant/user IDs with human-readable strings
#   (e.g. "tenant-main-001", "user-admin-001"). Prisma also generates CUIDs
#   for new records, but third-party integrations or migration scripts may
#   insert IDs with different formats. Using z.string().cuid() in a request
#   DTO causes a 500 for any caller whose ID doesn't match the strict CUID
#   regex — a silent, hard-to-diagnose failure.
#
#   Rule: use z.string().min(1) for ALL ID fields in input/request schemas.
#         z.string().cuid() is only acceptable in *response* model schemas
#         that describe data we wrote ourselves.
#
# USAGE:
#   bash scripts/check-no-cuid-in-dtos.sh        # in CI or pre-commit
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SEARCH_DIRS=(
  "services"
  "packages/shared-validators"
)

# Files that define request/input DTOs — response model files are excluded
DTO_PATTERN="*.dto.ts"
VALIDATOR_PATTERN="*.schema.ts"

FOUND=0

for dir in "${SEARCH_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then continue; fi

  while IFS= read -r -d '' file; do
    if grep -qn 'z\.string()\.cuid()' "$file"; then
      echo "❌  $file contains z.string().cuid() — use z.string().min(1) in input DTOs"
      grep -n 'z\.string()\.cuid()' "$file"
      FOUND=1
    fi
  done < <(find "$dir" \( -name "$DTO_PATTERN" -o -name "$VALIDATOR_PATTERN" \) -print0)
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "FAIL: Replace z.string().cuid() with z.string().min(1) in the files above."
  echo "      See scripts/check-no-cuid-in-dtos.sh for the rationale."
  exit 1
fi

echo "✅  No z.string().cuid() found in input DTO / validator files."
