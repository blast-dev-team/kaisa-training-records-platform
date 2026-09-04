#!/usr/bin/env python3
"""ClickUp 티켓 CLI — 공식 API(v2) 래퍼. 표준 라이브러리만 사용.

토큰: 환경변수 CLICKUP_TOKEN → 없으면 ref/clickup-api.md 에서 파싱 (ref/ 는 gitignore).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.clickup.com/api/v2"
TEAM_ID = "9018264341"
LIST_ID = "901817185368"  # BOYD > Client Project Tasks > Gongcar
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SIDEBAR = os.path.join(
    REPO_ROOT, "frontend", "apps", "crm-fe", "src", "widget", "sidebar", "ui", "sidebar.tsx"
)
NAV_MAP = os.path.join(HERE, "nav-map.json")


def token() -> str:
    tok = os.environ.get("CLICKUP_TOKEN")
    if tok:
        return tok.strip()
    ref = os.path.join(REPO_ROOT, "ref", "clickup-api.md")
    try:
        with open(ref, encoding="utf-8") as f:
            m = re.search(r"(pk_[A-Za-z0-9_]+)", f.read())
        if m:
            return m.group(1)
    except OSError:
        pass
    sys.exit("토큰 없음: CLICKUP_TOKEN 환경변수를 설정하거나 ref/clickup-api.md 를 확인하세요.")


def call(method: str, path: str, params: dict | None = None, body: dict | None = None):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", token())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"[{e.code}] {method} {path}\n{e.read().decode()}")


def is_custom(task_id: str) -> bool:
    """TICKET-17182 같은 custom id 인지 (내부 id 는 86ey... 형태)."""
    return "-" in task_id


def id_params(task_id: str) -> dict:
    return {"custom_task_ids": "true", "team_id": TEAM_ID} if is_custom(task_id) else {}


# ── 조회 ────────────────────────────────────────────────────────────────────


def fetch_task(task_id: str, markdown: bool = True) -> dict:
    p = id_params(task_id)
    if markdown:
        p["include_markdown_description"] = "true"
    return call("GET", f"/task/{task_id}", params=p)


def fetch_all_tasks() -> list[dict]:
    """Gongcar 리스트의 전 태스크(하위 포함, 종료 포함)를 페이지네이션으로 수집."""
    out, page = [], 0
    while True:
        res = call(
            "GET",
            f"/list/{LIST_ID}/task",
            params={"subtasks": "true", "include_closed": "true", "page": page},
        )
        tasks = res.get("tasks", [])
        out.extend(tasks)
        if res.get("last_page") or not tasks:
            break
        page += 1
    return out


def label(t: dict) -> str:
    return f"{t.get('custom_id') or t['id']} [{t['status']['status']}] {t['name']}"


def cmd_get(args):
    t = fetch_task(args.task_id)
    if args.json:
        print(json.dumps(t, ensure_ascii=False, indent=2))
        return
    print(f"# {t['name']}")
    print(f"- id: {t.get('custom_id')} ({t['id']})")
    print(f"- status: {t['status']['status']}")
    print(f"- url: {t['url']}")
    print(f"- parent: {t.get('parent')}")
    print(f"- assignees: {', '.join(a['username'] for a in t.get('assignees', [])) or '-'}")
    print("\n---\n")
    print(t.get("markdown_description") or t.get("description") or "(설명 없음)")


def cmd_tree(args):
    tasks = fetch_all_tasks()
    by_id = {t["id"]: t for t in tasks}
    root = fetch_task(args.task_id, markdown=False)
    children: dict[str, list[dict]] = {}
    for t in tasks:
        if t.get("parent"):
            children.setdefault(t["parent"], []).append(t)
    for kids in children.values():
        kids.sort(key=lambda x: x.get("custom_id") or "")

    def walk(node: dict, depth: int):
        desc_len = len(node.get("description") or "")
        mark = "" if desc_len else "  ← 설명 없음"
        print(f"{'  ' * depth}{'- ' if depth else ''}{label(node)}{mark}")
        if args.depth and depth >= args.depth:
            return
        for kid in children.get(node["id"], []):
            walk(kid, depth + 1)

    walk(by_id.get(root["id"], root), 0)


def cmd_search(args):
    kw = args.keyword.lower()
    for t in fetch_all_tasks():
        hay = (t["name"] + " " + (t.get("description") or "")).lower()
        if kw in hay:
            print(label(t))


def cmd_list(args):
    for t in fetch_all_tasks():
        if args.status and t["status"]["status"] != args.status:
            continue
        if args.parent and t.get("parent") != args.parent:
            continue
        print(label(t))


def cmd_statuses(args):
    lst = call("GET", f"/list/{LIST_ID}")
    for s in lst.get("statuses", []):
        print(s["status"])


def cmd_comments(args):
    res = call("GET", f"/task/{args.task_id}/comment", params=id_params(args.task_id))
    for c in reversed(res.get("comments", [])):
        who = c.get("user", {}).get("username", "?")
        print(f"--- {who} ---")
        print(c.get("comment_text", "").strip())
        print()


# ── 사이드바 대조 ───────────────────────────────────────────────────────────


def parse_sidebar() -> list[dict]:
    """sidebar.tsx 의 NAV_SECTIONS_RAW 를 훑어 메뉴 노드를 평탄한 리스트로 뽑는다.

    노드: {id, label, href, depth, parent}. parent 가 None 이면 대메뉴(대분류).
    """
    with open(SIDEBAR, encoding="utf-8") as f:
        lines = f.read().splitlines()
    try:
        start = next(i for i, ln in enumerate(lines) if "NAV_SECTIONS_RAW" in ln and "=" in ln)
    except StopIteration:
        sys.exit(f"NAV_SECTIONS_RAW 를 찾지 못했습니다: {SIDEBAR}")

    nodes: list[dict] = []
    stack: list[dict] = []
    depth = 0
    for ln in lines[start:]:
        s = ln.strip()
        if s.startswith("//"):
            continue
        m = re.match(r"id: '([^']+)'", s)
        if m:
            while stack and stack[-1]["depth"] >= depth:
                stack.pop()
            node = {
                "id": m.group(1),
                "label": "",
                "href": "",
                "depth": depth,
                "parent": stack[-1]["id"] if stack else None,
            }
            nodes.append(node)
            stack.append(node)
        elif nodes:
            m = re.match(r"label: '([^']*)'", s)
            if m and nodes[-1]["depth"] == depth and not nodes[-1]["label"]:
                nodes[-1]["label"] = m.group(1)
            m = re.match(r"href: '([^']*)'", s)
            if m and nodes[-1]["depth"] == depth:
                nodes[-1]["href"] = m.group(1)
        depth += s.count("{") + s.count("[") - s.count("}") - s.count("]")
        if depth <= 0 and nodes:
            break
    return nodes


def pad(text: str, width: int) -> str:
    """한글을 2칸으로 세서 폭을 맞춘다."""
    w = sum(2 if ord(c) > 0x2E7F else 1 for c in text)
    return text + " " * max(1, width - w)


def norm(name: str) -> str:
    """이름 매칭용 정규화 — 공백·구분자(· * / , 등) 제거. '구매·매각' == '구매*매각'."""
    return re.sub(r"[^0-9a-z가-힣]", "", name.lower())


def load_nav_map() -> dict:
    try:
        with open(NAV_MAP, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return {}


def cmd_nav(args):
    nodes = parse_sidebar()
    mapping = load_nav_map()
    tasks = fetch_all_tasks()
    by_cid = {t.get("custom_id"): t for t in tasks if t.get("custom_id")}
    by_id = {t["id"]: t for t in tasks}
    kids: dict[str, list[dict]] = {}
    for t in tasks:
        if t.get("parent"):
            kids.setdefault(t["parent"], []).append(t)

    def resolve(cid: str | None) -> dict | None:
        if not cid:
            return None
        return by_cid.get(cid) or by_id.get(cid)

    def descendants(task: dict) -> list[dict]:
        out, queue = [], list(kids.get(task["id"], []))
        while queue:
            cur = queue.pop()
            out.append(cur)
            queue.extend(kids.get(cur["id"], []))
        return out

    def mark(task: dict | None, src: str) -> str:
        if not task:
            return "✗ 티켓 없음"
        body = "" if (task.get("description") or "").strip() else "  ← 본문 없음"
        return f"{task.get('custom_id') or task['id']} [{task['status']['status']}] ({src}){body}"

    children_of = {n["id"]: [] for n in nodes}
    roots = []
    for n in nodes:
        (children_of[n["parent"]] if n["parent"] else roots).append(n)

    stat = {"cat": [0, 0], "leaf": [0, 0], "nobody": 0}

    def walk(node: dict, cat_task: dict | None, indent: int):
        task = resolve(mapping.get(node["id"]))
        src = "map"
        if not task and cat_task:
            for d in descendants(cat_task):
                if norm(d["name"]) == norm(node["label"]):
                    task, src = d, "auto"
                    break
        is_cat = indent == 0
        key = "cat" if is_cat else "leaf"
        stat[key][1] += 1
        if task:
            stat[key][0] += 1
            if not (task.get("description") or "").strip():
                stat["nobody"] += 1
        line = f"{'  ' * indent}{node['label'] or node['id']}"
        path = f"  {node['href']}" if node["href"] else ""
        if not args.todo or not task or not (task.get("description") or "").strip():
            print(pad(f"{line}{path}", 58) + mark(task, src))
        for kid in children_of[node["id"]]:
            walk(kid, task if is_cat else cat_task, indent + 1)

    for r in roots:
        walk(r, None, 0)
        print()
    print(
        f"대분류 {stat['cat'][0]}/{stat['cat'][1]} · "
        f"하위 {stat['leaf'][0]}/{stat['leaf'][1]} · 본문 없는 티켓 {stat['nobody']}"
    )


# ── 쓰기 ────────────────────────────────────────────────────────────────────


def read_body(args) -> str | None:
    if args.desc_file:
        with open(args.desc_file, encoding="utf-8") as f:
            return f.read()
    return args.desc


def cmd_update(args):
    body: dict = {}
    if args.name:
        body["name"] = args.name
    if args.status:
        body["status"] = args.status
    md = read_body(args)
    if md is not None:
        if args.append:
            cur = fetch_task(args.task_id)
            prev = (cur.get("markdown_description") or cur.get("description") or "").rstrip()
            md = f"{prev}\n\n{md}" if prev else md
        body["markdown_content"] = md
    if not body:
        sys.exit("변경할 항목이 없습니다 (--name/--status/--desc/--desc-file)")
    t = call("PUT", f"/task/{args.task_id}", params=id_params(args.task_id), body=body)
    print(f"updated: {label(t)}\n{t['url']}")


def cmd_create(args):
    body: dict = {"name": args.name}
    if args.parent:
        parent = args.parent
        if is_custom(parent):
            parent = fetch_task(parent, markdown=False)["id"]
        body["parent"] = parent
    if args.status:
        body["status"] = args.status
    md = read_body(args)
    if md is not None:
        body["markdown_content"] = md
    t = call("POST", f"/list/{LIST_ID}/task", body=body)
    print(f"created: {label(t)}\n{t['url']}")


def cmd_comment(args):
    text = read_body(args) or ""
    if not text.strip():
        sys.exit("본문이 비었습니다 (--desc/--desc-file)")
    call(
        "POST",
        f"/task/{args.task_id}/comment",
        params=id_params(args.task_id),
        body={"comment_text": text, "notify_all": False},
    )
    print("commented")


def cmd_delete(args):
    if not args.yes:
        sys.exit("삭제는 --yes 필요")
    call("DELETE", f"/task/{args.task_id}", params=id_params(args.task_id))
    print("deleted")


def main():
    p = argparse.ArgumentParser(description="ClickUp 티켓 CLI (Gongcar 리스트)")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("get", help="티켓 상세 + 설명(markdown)")
    g.add_argument("task_id")
    g.add_argument("--json", action="store_true")
    g.set_defaults(func=cmd_get)

    t = sub.add_parser("tree", help="하위 티켓 트리")
    t.add_argument("task_id")
    t.add_argument("--depth", type=int, default=0, help="0=제한없음")
    t.set_defaults(func=cmd_tree)

    s = sub.add_parser("search", help="이름·설명 키워드 검색")
    s.add_argument("keyword")
    s.set_defaults(func=cmd_search)

    ls = sub.add_parser("list", help="리스트 전체 (필터 가능)")
    ls.add_argument("--status")
    ls.add_argument("--parent")
    ls.set_defaults(func=cmd_list)

    sub.add_parser("statuses", help="사용 가능한 상태값").set_defaults(func=cmd_statuses)

    nv = sub.add_parser("nav", help="사이드바 메뉴 ↔ 티켓 대조")
    nv.add_argument("--todo", action="store_true", help="티켓·본문 없는 항목만")
    nv.set_defaults(func=cmd_nav)

    cs = sub.add_parser("comments", help="댓글 조회")
    cs.add_argument("task_id")
    cs.set_defaults(func=cmd_comments)

    u = sub.add_parser("update", help="이름·상태·설명 수정")
    u.add_argument("task_id")
    u.add_argument("--name")
    u.add_argument("--status")
    u.add_argument("--desc")
    u.add_argument("--desc-file")
    u.add_argument("--append", action="store_true", help="기존 설명 뒤에 이어붙임 (기본은 덮어쓰기)")
    u.set_defaults(func=cmd_update)

    c = sub.add_parser("create", help="티켓 생성")
    c.add_argument("--name", required=True)
    c.add_argument("--parent")
    c.add_argument("--status")
    c.add_argument("--desc")
    c.add_argument("--desc-file")
    c.set_defaults(func=cmd_create)

    cm = sub.add_parser("comment", help="댓글 작성")
    cm.add_argument("task_id")
    cm.add_argument("--desc")
    cm.add_argument("--desc-file")
    cm.set_defaults(func=cmd_comment)

    d = sub.add_parser("delete", help="티켓 삭제 (--yes 필수)")
    d.add_argument("task_id")
    d.add_argument("--yes", action="store_true")
    d.set_defaults(func=cmd_delete)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
