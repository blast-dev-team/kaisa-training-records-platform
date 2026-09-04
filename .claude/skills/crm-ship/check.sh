#!/usr/bin/env bash
# 커밋·PR 전 사실 확인. 판단은 사람이, 수집은 여기서.
#
# 출력: 브랜치 · dev 대비 위치 · 변경 레이어 · 마이그레이션 · 배포 순서 필요 여부
# 아무것도 고치지 않는다 (읽기 전용).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

BASE="${1:-origin/dev}"
BR=$(git branch --show-current)

echo "── 브랜치"
if [ "$BR" = "dev" ] || [ "$BR" = "main" ]; then
  echo "   ⚠️  $BR — 보호 브랜치다. 기능 브랜치를 먼저 판다"
else
  echo "   $BR"
fi

git fetch -q origin 2>/dev/null
if ! git rev-parse --verify -q "$BASE" >/dev/null; then
  echo "   ⚠️  $BASE 없음 — 이후 비교를 건너뛴다"; exit 0
fi

MB=$(git merge-base HEAD "$BASE")
AHEAD=$(git rev-list --count "$MB"..HEAD)
BEHIND=$(git rev-list --count HEAD.."$BASE")
echo "   $BASE 대비  앞 ${AHEAD}커밋 / 뒤 ${BEHIND}커밋"
if [ "$BEHIND" -gt 0 ]; then
  echo "   ⚠️  뒤처졌다 — 리베이스 필요. 겹치는 파일:"
  ov=$(comm -12 \
        <(git diff --name-only HEAD..."$BASE" | sort) \
        <(git diff --name-only "$MB"..HEAD | sort))
  [ -n "$ov" ] && echo "$ov" | sed 's/^/       /' || echo "       (없음 — 충돌 가능성 낮다)"
fi

# 커밋된 것 + 워킹트리 + 스테이지 + **untracked**.
# 새 마이그레이션은 대개 untracked 라, 빼면 정작 중요한 걸 놓친다.
FILES=$(
  git diff --name-only "$MB"..HEAD
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
)
FILES=$(echo "$FILES" | sort -u | grep -v '^$')
[ -z "$FILES" ] && { echo; echo "── 변경 없음"; exit 0; }

echo
echo "── 변경 레이어 (커밋 접두사 판단용)"
declare -a LAYERS=()
echo "$FILES" | grep -q '^backend/'            && LAYERS+=("be")
echo "$FILES" | grep -q '^frontend/'           && LAYERS+=("fe")
echo "$FILES" | grep -q '^\.github/'           && LAYERS+=("ci")
echo "$FILES" | grep -qE '^(docker|nginx|infra)' && LAYERS+=("infra")
echo "$FILES" | grep -q '^docs/'               && LAYERS+=("docs")
echo "$FILES" | grep -q '^\.claude/'           && LAYERS+=("skills/rules")
if [ ${#LAYERS[@]} -eq 0 ]; then
  echo "   (분류 밖)"
else
  printf '   %s\n' "${LAYERS[*]}"
  if [ ${#LAYERS[@]} -gt 1 ]; then
    echo "   → 여럿이다. 커밋 분리가 원칙(project/git-commit.md). 불가피하면 주된 레이어로"
  fi
fi

echo
echo "── 마이그레이션"
MIG=$(echo "$FILES" | grep 'alembic/versions/' || true)
if [ -z "$MIG" ]; then
  echo "   없음 → PR 에 '마이그레이션 불필요' 를 명시한다"
else
  echo "$MIG" | sed 's/^/   /'
  echo "   ⚠️  PR 에 **마이그레이션 필요** 를 크게 적는다"
  echo "       · 프로덕션 alembic 은 수동이다 (스테이징은 자동)"
  echo "       · down_revision 과 head 를 확인 — CI 가 single head 를 검사한다"
  for f in $MIG; do
    [ -f "$f" ] || continue
    # 따옴표가 ' 든 " 든 값만 뽑는다
    rev=$(grep -m1 -E "^revision" "$f" | sed -E "s/.*[=:][^\"']*[\"']([^\"']+)[\"'].*/\1/")
    down=$(grep -m1 -E "^down_revision" "$f" | sed -E "s/.*[=:][^\"']*[\"']([^\"']+)[\"'].*/\1/")
    echo "       · $(basename "$f"): $down → $rev"
  done
fi

echo
echo "── 배포 순서"
HAS_BE=$(echo "$FILES" | grep -c '^backend/' || true)
HAS_FE=$(echo "$FILES" | grep -c '^frontend/' || true)
if [ "$HAS_BE" -gt 0 ] && [ "$HAS_FE" -gt 0 ]; then
  echo "   ⚠️  BE·FE 동시 변경 — **BE 태그가 FE 보다 먼저** 나가야 한다"
  echo "       FE 는 dev 머지로 Amplify 가 자동 배포하고, BE 는 be-staging-v* /"
  echo "       be-prod-v* 태그가 수동이다. 역순이면 화면은 열리는데 서버가 거부한다"
  echo "       → PR 본문에 '배포 순서' 절을 넣는다"
elif [ "$HAS_BE" -gt 0 ]; then
  echo "   BE 만 — 태그 배포 필요 (be-staging-v* / be-prod-v*)"
elif [ "$HAS_FE" -gt 0 ]; then
  echo "   FE 만 — dev 머지 시 자동 배포"
else
  echo "   해당 없음"
fi
