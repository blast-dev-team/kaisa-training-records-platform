FROM python:3.13-slim

# 컨테이너 타임존 = KST. 한국 전용 서비스라 '오늘'은 KST 기준이 맞다.
# 절대시각 저장은 timestamptz 라 영향받지 않는다.
ENV TZ=Asia/Seoul

# uv 설치
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 1. 의존성 lock 파일만 먼저 복사 → 레이어 캐시 활용 (코드만 바꿔도 deps 재설치 안 함)
COPY pyproject.toml uv.lock ./

# 2. 컨테이너 안에서 venv 생성 (linux/amd64 보장)
RUN uv sync --frozen --no-dev

# 3. 앱 코드 복사 (.dockerignore가 로컬 .venv 제외)
COPY . .

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
