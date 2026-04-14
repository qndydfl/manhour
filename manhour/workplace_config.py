# workplace_config.py는 “초기 기본 근무지 목록”을 제공하는 fallback 역할입니다.
# DB에 Workplace가 하나도 없을 때만 이 파일의 DEFAULT_WORKPLACE_DEFINITIONS을 사용해서 기본 항목을 생성합니다. 이후에는 settings.html에서 추가/수정/삭제한 내용이 DB에 저장되므로, 일반 운영 중에는 이 파일이 직접 쓰이지 않습니다.

from __future__ import annotations


DEFAULT_WORKPLACE_DEFINITIONS = [
    {"code": "ICN-1", "label": "ICN-1그룹", "sort_order": 0, "is_active": True},
    {"code": "ICN-3", "label": "ICN-3그룹", "sort_order": 1, "is_active": True},
    {"code": "ICN-5", "label": "ICN-5그룹", "sort_order": 2, "is_active": True},
    {"code": "GMP-1", "label": "GMP-1그룹", "sort_order": 3, "is_active": True},
    {"code": "GMP-3", "label": "GMP-3그룹", "sort_order": 4, "is_active": True},
    {"code": "GMP-5", "label": "GMP-5그룹", "sort_order": 5, "is_active": True},
]


def get_default_workplace_choices() -> list[tuple[str, str]]:
    return [
        (definition["code"], definition["label"])
        for definition in DEFAULT_WORKPLACE_DEFINITIONS
    ]
