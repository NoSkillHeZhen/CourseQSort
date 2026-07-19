# CourseQSort Backend

CourseQSort 后端基于 Django + Django REST Framework，提供认证、课程与资源管理、学生选课、排课方案生成、冲突分析、算法参数配置等接口。

## 技术栈

- Python 3.13
- Django
- Django REST Framework
- SimpleJWT
- SQLite（默认开发环境）
- openpyxl
- pytest / pytest-django / pytest-cov
- flake8 / black / isort

说明：

- `celery` 和 `redis` 依赖仍在 `requirements.txt` 中保留
- 但当前代码里的排课生成与冲突分析任务，是通过 Django 进程内线程启动同步任务执行，不是实际通过 Celery worker 派发

## 目录结构

```text
backend/
├── manage.py
├── requirements.txt
├── requirements-dev.txt
├── pytest.ini
├── pyproject.toml
├── config/
├── apps/
│   ├── accounts/
│   ├── courses/
│   ├── protected_slots/
│   ├── scheduling/
│   ├── conflict_analysis/
│   ├── algorithm_config/
│   ├── student/
│   └── common/
└── .github/workflows/backend-ci.yml   (仓库根目录)
```

## 本地启动

安装依赖：

```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
```

启动开发服务器：

```bash
python manage.py runserver 8000
```

默认开发数据库为：

- `backend/db.sqlite3`

## 主要 API 路由

根路由前缀定义于 [config/urls.py](/D:/OJ/CourseQSort/backend/config/urls.py:1)：

- `api/v1/auth/`
- `api/v1/admin/`
- `api/v1/student/`
- `api/v1/teacher/`

### 认证

- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/register/`
- `POST /api/v1/auth/refresh/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/me/`

### 教务端

- 课程、教师、教室、专业、学生、班级、课程分配：
  - 由 [apps/courses/urls.py](/D:/OJ/CourseQSort/backend/apps/courses/urls.py:1) 提供
- 保护时段：
  - 由 [apps/protected_slots/urls.py](/D:/OJ/CourseQSort/backend/apps/protected_slots/urls.py:1) 提供
- 排课：
  - 由 [apps/scheduling/urls.py](/D:/OJ/CourseQSort/backend/apps/scheduling/urls.py:1) 提供
- 冲突分析：
  - 由 [apps/conflict_analysis/urls.py](/D:/OJ/CourseQSort/backend/apps/conflict_analysis/urls.py:1) 提供
- 算法参数：
  - 由 [apps/algorithm_config/urls.py](/D:/OJ/CourseQSort/backend/apps/algorithm_config/urls.py:1) 提供

### 学生端

- `GET /api/v1/student/schedule/`
- `GET /api/v1/student/courses/`
- `GET /api/v1/student/courses/{id}/conflict-detail/`
- `POST /api/v1/student/courses/{id}/select/`
- `DELETE /api/v1/student/courses/{id}/drop/`
- `GET /api/v1/student/free-slots/`
- `GET /api/v1/student/free-slots/{day}/{period}/recommend/`

### 教师端

- `GET /api/v1/teacher/schedule/`

## 当前实现要点

### 课程导入

课程导入入口是：

- `POST /api/v1/admin/courses/import/`

当前实现位于 [apps/courses/views.py](/D:/OJ/CourseQSort/backend/apps/courses/views.py:459)，只接受 `.json` 文件上传。

也就是说：

- 当前支持 `JSON-only` 导入
- 不支持 Excel 上传导入

导入逻辑位于：

- [apps/courses/import_export.py](/D:/OJ/CourseQSort/backend/apps/courses/import_export.py:371)

### 排课任务

排课入口：

- `POST /api/v1/admin/schedule/generate/`

任务状态查询：

- `GET /api/v1/admin/schedule/tasks/{uuid}/`

当前行为：

- 先创建 `SchedulePlan` 和 `TaskRecord`
- 然后在视图里通过线程启动 `run_generate_sync`
- 前端需要轮询任务状态，而不是等待同步返回结果

相关代码：

- [apps/scheduling/views.py](/D:/OJ/CourseQSort/backend/apps/scheduling/views.py:18)

### 冲突分析任务

冲突分析入口：

- `POST /api/v1/admin/conflict-analysis/run/`

任务状态查询：

- `GET /api/v1/admin/conflict-analysis/tasks/{uuid}/`

当前行为同样是：

- 先创建结果记录和任务记录
- 再通过线程启动 `run_analysis_sync`

相关代码：

- [apps/conflict_analysis/views.py](/D:/OJ/CourseQSort/backend/apps/conflict_analysis/views.py:13)

## 测试与代码质量

### 运行测试

```bash
cd backend
python -m pytest
```

`pytest.ini` 当前配置包括：

- `DJANGO_SETTINGS_MODULE = config.settings`
- 覆盖率门槛 `--cov-fail-under=60`

### 运行格式和静态检查

```bash
python -m isort apps config manage.py --check-only
python -m black apps config manage.py --check
python -m flake8 apps config manage.py --jobs=1
```

### 检查迁移

```bash
python manage.py makemigrations --check --dry-run
python manage.py check
```

## CI

后端 GitHub Actions 工作流：

- `.github/workflows/backend-ci.yml`

CI 目前分两段：

1. `quality`
   - `isort`
   - `black`
   - `flake8`
2. `test`
   - `makemigrations --check --dry-run`
   - `manage.py check`
   - `pytest`

## 文档说明

这个 README 只描述当前代码实际状态。

如果未来恢复以下能力，需要同步更新文档：

- Excel 课程导入
- 真正基于 Celery / Redis 的异步任务执行
- `apps/common` 中新增可复用 mixin / utils 的公开能力说明
