"""공용 FastAPI 의존성.

인증(세션/유저)이 필요해지면 여기에 get_current_user 등을 추가한다.
지금은 DB 세션 의존성만 재노출한다.
"""

from app.core.database import get_db

__all__ = ["get_db"]
