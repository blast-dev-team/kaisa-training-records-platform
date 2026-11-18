"""P08 be-inquiry 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import asyncio
from datetime import timedelta

from sqlalchemy import select

from app.core.crypto import encrypt_field, name_columns, phone_hash
from app.core.kst import now_kst
from app.core.security import hash_password
from app.domain.audit.model import AuditLog
from app.domain.inquiry.model import Inquiry
from tests.integration.helpers import admin_cookie, make_admin

NAME, PHONE = "김비회", "01012345678"


def _guest_row(password_hash: str, title: str, created_at=None) -> Inquiry:
    enc, h = name_columns(NAME)
    row = Inquiry(
        category="etc",
        title=title,
        content="c",
        status="open",
        author_name_encrypted=enc,
        author_name_hash=h,
        author_phone_encrypted=encrypt_field(PHONE),
        author_phone_hash=phone_hash(PHONE),
        password_hash=password_hash,
    )
    if created_at is not None:
        row.created_at = created_at
    return row


async def test_P08_1_concurrent_first_answers_lose_audit_trail(client, db, monkeypatch):
    """Two admins answer an open inquiry at once: the answer that was briefly shown
    must be preserved in some audit 'before' (service comment: 수정 전 답변을 남겨
    교육생에게 보였던 내용을 되짚을 수 있게). Expect one inquiry.answered + one
    inquiry.answer_updated."""
    _a1, t1 = await make_admin(db, email="a1@example.com")
    _a2, t2 = await make_admin(db, email="a2@example.com")
    row = _guest_row(hash_password("123456"), "q")
    db.add(row)
    await db.commit()
    iid = row.id
    # widen the read->commit window deterministically (no source change): both
    # requests read the row before either commits, as two real admins can
    from app.domain.inquiry.repository import inquiry_repository as repo

    real_get = repo.get

    async def slow_get(session, inquiry_id):
        got = await real_get(session, inquiry_id)
        await asyncio.sleep(0.3)
        return got

    monkeypatch.setattr(repo, "get", slow_get)

    r1, r2 = await asyncio.gather(
        client.put(
            f"/api/inquiries/{iid}/answer",
            json={"answer": "답변A"},
            cookies=admin_cookie(t1),
        ),
        client.put(
            f"/api/inquiries/{iid}/answer",
            json={"answer": "답변B"},
            cookies=admin_cookie(t2),
        ),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    logs = (
        (await db.execute(select(AuditLog).where(AuditLog.entity_type == "inquiry")))
        .scalars()
        .all()
    )
    actions = sorted(log.action for log in logs)
    assert actions == ["inquiry.answer_updated", "inquiry.answered"], actions


async def test_P08_2_lookup_verify_cost_leaks_inquiry_count(client, db, monkeypatch):
    """Service comment: 후보가 없을 때도 같은 비용의 검증을 한 번 해 응답 시간으로
    '이 사람이 문의했는지' 새지 않게. A wrong-password lookup should cost the same
    number of pbkdf2 verifications regardless of how many inquiries the target has."""
    from app.domain.inquiry.service import inquiry_service as svc

    calls = {"n": 0}
    real = svc.verify_password

    def counting(pw, h):
        calls["n"] += 1
        return real(pw, h)

    monkeypatch.setattr(svc, "verify_password", counting)
    h = hash_password("123456")
    for i in range(3):
        db.add(_guest_row(h, f"q{i}"))
    await db.commit()

    body = {"name": NAME, "phone": PHONE, "password": "999999"}
    await client.post("/api/public/inquiries/lookup", json={**body, "name": "없는사람"})
    cost_absent = calls["n"]
    calls["n"] = 0
    await client.post("/api/public/inquiries/lookup", json=body)
    cost_present = calls["n"]
    assert cost_present == cost_absent, (cost_absent, cost_present)


async def test_P08_3_candidate_cap_hides_own_older_inquiry(client, db):
    """Guest whose own inquiry is older than 20 other same name+phone guest inquiries
    (e.g. planted by someone knowing name+phone, 5/IP/10min) can no longer see it
    with the correct password — lookup returns 404."""
    base = now_kst() - timedelta(days=1)
    db.add(_guest_row(hash_password("123456"), "mine", created_at=base))
    other = hash_password("777777")
    for i in range(20):
        db.add(
            _guest_row(other, f"planted{i}", created_at=base + timedelta(minutes=i + 1))
        )
    await db.commit()

    resp = await client.post(
        "/api/public/inquiries/lookup",
        json={"name": NAME, "phone": PHONE, "password": "123456"},
    )
    assert resp.status_code == 200, resp.text
    assert [i["title"] for i in resp.json()] == ["mine"]
