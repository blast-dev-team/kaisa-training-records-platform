---
description: "Django + Django REST Framework(DRF) 패턴"
paths:
  - "**/views.py"
  - "**/serializers.py"
  - "**/models.py"
  - "**/urls.py"
  - "**/*.py"
---

# Django / DRF Guidelines

> 응답 형태·에러 코드·페이지네이션은 반드시 `back/api-design.md` 기준을 따른다.

## 프로젝트 구조

```
project/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── local.py
│   │   └── production.py
│   └── urls.py
└── (앱)/
    ├── models.py
    ├── serializers.py
    ├── views.py          # ViewSet 또는 APIView
    ├── urls.py
    └── services.py       # 비즈니스 로직 분리 (복잡한 경우)
```

## 모델

```python
from django.db import models

class User(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]
```

- `auto_now_add` / `auto_now` 로 생성/수정 시각 자동 처리
- `Meta.ordering` 으로 기본 정렬 설정
- 자주 필터하는 필드에 `db_index=True`

## Serializers

```python
from rest_framework import serializers

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "created_at"]
        read_only_fields = ["id", "created_at"]

class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["email", "name", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
```

- 입력/출력 Serializer 분리 (복잡한 경우)
- `read_only_fields` 로 수정 불가 필드 명시
- `write_only=True` 로 비밀번호 등 민감 필드 응답 제외

## ViewSets

CRUD 가 필요한 리소스는 `ModelViewSet` 사용. 일부 액션만 필요하면 `mixins` 조합.

```python
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        user.is_active = False
        user.save()
        return Response({"ok": True})
```

## URL 라우팅

```python
# (앱)/urls.py
from rest_framework.routers import DefaultRouter
from .views import UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet)
urlpatterns = router.urls
```

## 에러 처리

DRF 기본 포맷(`{ "detail": "..." }`)을 `back/api-design.md` 형식으로 변환하려면
커스텀 `EXCEPTION_HANDLER`를 등록한다.

```python
# config/exceptions.py
from rest_framework.views import exception_handler
from rest_framework.response import Response

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    code = getattr(exc, 'code', None) or 'INTERNAL_ERROR'
    detail = exc.detail if hasattr(exc, 'detail') else str(exc)

    # 유효성 검사 에러 (필드별 오류)
    if isinstance(detail, dict):
        errors = [
            {"field": field, "message": str(msgs[0]) if isinstance(msgs, list) else str(msgs)}
            for field, msgs in detail.items()
        ]
        response.data = {
            "code": "VALIDATION_ERROR",
            "message": "입력값을 확인해 주세요",
            "errors": errors,
        }
    else:
        response.data = {
            "code": code.upper() if isinstance(code, str) else 'INTERNAL_ERROR',
            "message": str(detail),
        }

    return response

# settings.py
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "config.exceptions.custom_exception_handler"
}
```

예외를 던질 때는 `code`를 명시적으로 설정:

```python
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework import status
from rest_framework.exceptions import APIException

# 내장 예외 — code는 자동으로 'not_found', 'permission_denied' 등으로 설정됨
raise NotFound("차량을 찾을 수 없어요")           # code: NOT_FOUND
raise PermissionDenied("접근 권한이 없어요")       # code: FORBIDDEN

# 커스텀 코드가 필요할 때
class DuplicateException(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'DUPLICATE_EMAIL'
    default_detail = '이미 등록된 이메일이에요'

raise DuplicateException()
```

- 에러 코드 목록은 `back/api-design.md` 참고
- `message`는 한국어, 사용자에게 보여줄 수 있는 문장으로

## 쿼리 최적화

```python
# N+1 방지
queryset = User.objects.select_related("profile").prefetch_related("groups")

# 필요한 필드만
queryset = User.objects.only("id", "email", "name")

# 집계
from django.db.models import Count
queryset = User.objects.annotate(group_count=Count("groups"))
```

## 환경변수 (django-environ)

```python
# settings/base.py
import environ

env = environ.Env()
environ.Env.read_env(".env")

DATABASES = {"default": env.db("DATABASE_URL")}
SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)
```

## 원칙

- View 는 얇게 유지 (복잡한 로직은 `services.py` 또는 모델 메서드로)
- `select_related` / `prefetch_related` 로 N+1 방지
- 마이그레이션 파일은 반드시 커밋
- `settings/` 폴더로 환경별 설정 분리
