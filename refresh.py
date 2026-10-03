#!/usr/bin/env python3
"""
从飞书多维表格「简历素材」拉取记录，生成静态个人网站所需的 api/profile.json。

设计要点：
- 使用飞书 OpenAPI（app_id + app_secret 换取 tenant_access_token）
- 支持分页读取记录
- 输出结构化 JSON 供前端直接消费
- 不把任何 token / URL 硬编码在脚本里

注意：本表为履历/素材数据，没有视频附件，因此不需要「临时链接刷新」，
本脚本只负责把表格最新内容同步成静态 JSON，保持网站与飞书表格一致。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_DIR = Path(__file__).resolve().parent
API_DIR = REPO_DIR / "api"
PROFILE_FILE = API_DIR / "profile.json"

APP_ID = os.environ.get("LARK_APP_ID", "").strip()
APP_SECRET = os.environ.get("LARK_APP_SECRET", "").strip()
BASE_TOKEN = os.environ.get("LARK_BASE_TOKEN", "").strip()
TABLE_ID = os.environ.get("LARK_TABLE_ID", "").strip()

# 飞书字段名 → 输出键 的映射（按你的实际表结构）
FIELD_MAP = {
    "素材名称": "name",
    "素材类型": "type",
    "所属机构": "institution",
    "角色/职位": "role",
    "描述与职责": "description",
    "成果与亮点": "highlights",
    "适用岗位方向": "directions",
    "状态": "status",
    "开始时间": "start",
    "结束时间": "end",
}


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def require_env() -> None:
    missing = [
        name
        for name, value in (
            ("LARK_APP_ID", APP_ID),
            ("LARK_APP_SECRET", APP_SECRET),
            ("LARK_BASE_TOKEN", BASE_TOKEN),
            ("LARK_TABLE_ID", TABLE_ID),
        )
        if not value
    ]
    if missing:
        fail(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". Configure them as repository secrets before running refresh.py."
        )


def request_json(url: str, *, data: dict[str, Any] | None = None, token: str | None = None) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"HTTP {exc.code} calling {url}: {body}")
    except urllib.error.URLError as exc:
        fail(f"Request failed for {url}: {exc}")


def get_tenant_access_token() -> str:
    res = request_json(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        data={"app_id": APP_ID, "app_secret": APP_SECRET},
    )
    if res.get("code") != 0 or not res.get("tenant_access_token"):
        fail(f"Failed to get tenant access token: {json.dumps(res, ensure_ascii=False)}")
    return str(res["tenant_access_token"])


def get_records(tenant_token: str) -> list[dict[str, Any]]:
    all_records: list[dict[str, Any]] = []
    page_token = ""
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        url = (
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{TABLE_ID}/records?"
            + urllib.parse.urlencode(params)
        )
        res = request_json(url, token=tenant_token)
        if res.get("code") != 0:
            fail(f"Failed to fetch Bitable records: {json.dumps(res, ensure_ascii=False)}")
        data = res.get("data", {})
        all_records.extend(data.get("items", []))
        if not data.get("has_more"):
            break
        page_token = data.get("page_token", "")
        if not page_token:
            break
    return all_records


def fmt_date(value: Any) -> str:
    """飞书日期字段返回毫秒时间戳，转成 YYYY.MM；无值返回空串。"""
    if value in (None, "", 0):
        return ""
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return str(value)
    if ts <= 0:
        return ""
    dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    return f"{dt.year}.{dt.month:02d}"


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in ("text", "name", "value"):
            if isinstance(value.get(key), str):
                return value[key].strip()
        return ""
    if isinstance(value, list):
        parts = [normalize_text(item) for item in value]
        return ", ".join(p for p in parts if p)
    return str(value).strip()


def normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            t = normalize_text(item)
            if t:
                out.append(t)
        return out
    t = normalize_text(value)
    return [t] if t else []


def build_item(record: dict[str, Any]) -> dict[str, Any]:
    fields = record.get("fields", {})
    item: dict[str, Any] = {"id": record.get("record_id", "")}
    for feishu_name, out_key in FIELD_MAP.items():
        raw = fields.get(feishu_name)
        if out_key in ("start", "end"):
            item[out_key] = fmt_date(raw)
            item[f"{out_key}_ts"] = int(raw) if isinstance(raw, (int, float)) and raw else 0
        elif out_key == "directions":
            item[out_key] = normalize_list(raw)
        else:
            item[out_key] = normalize_text(raw)
    return item


def build_profile(records: list[dict[str, Any]]) -> dict[str, Any]:
    items = [build_item(r) for r in records]
    # 倒序：最近的时间在前
    items.sort(key=lambda it: (it.get("start_ts", 0) or 0), reverse=True)

    types: list[str] = []
    directions: list[str] = []
    for it in items:
        if it.get("type") and it["type"] not in types:
            types.append(it["type"])
        for d in it.get("directions", []):
            if d not in directions:
                directions.append(d)

    return {
        "_generated_at": datetime.now(timezone.utc).isoformat(),
        "_count": len(items),
        "types": types,
        "directions": directions,
        "items": items,
    }


def main() -> None:
    require_env()
    tenant_token = get_tenant_access_token()
    records = get_records(tenant_token)
    print(f"Fetched {len(records)} Bitable records.")

    profile = build_profile(records)
    API_DIR.mkdir(parents=True, exist_ok=True)
    PROFILE_FILE.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {profile['_count']} items to {PROFILE_FILE}.")


if __name__ == "__main__":
    main()
