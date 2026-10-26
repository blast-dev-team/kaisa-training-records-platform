"""교육생·교육내역 번호 — 대량 등록에서 충돌하지 않을 만큼 난수 공간이 넓은지."""

import re

from app.domain.trainee.service.trainee_service import new_trainee_no
from app.domain.training_record.service.training_record_service import _record_no


def test_trainee_no_has_12_hex_digits():
    # HEX4 시절엔 500명 일괄 등록이 ~85% 확률로 unique 위반 → 전체 롤백
    assert re.fullmatch(r"TR-\d{8}-[0-9A-F]{12}", new_trainee_no())


def test_trainee_no_unique_in_large_batch():
    assert len({new_trainee_no() for _ in range(5000)}) == 5000


def test_record_no_has_12_hex_digits():
    assert re.fullmatch(r"REC-\d{8}-[0-9a-f]{12}", _record_no())
