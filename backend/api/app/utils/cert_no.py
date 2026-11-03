def normalize_cert_no(value: str | None) -> str:
    """감리원증번호 비교 키 — 공백을 모두 뺀다.

    엑셀·수기 입력마다 띄어쓰기가 달라(`정보시스템감리협회 제 6144호` vs `제6144호`)
    원문 그대로 비교하면 같은 번호를 놓친다. 저장값은 원문 그대로 두고 비교할 때만 쓴다.
    """
    return "".join(value.split()) if value else ""
