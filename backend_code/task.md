# 后端项目结构说明

## 根目录文件

| 文件 | 描述 |
|------|------|
| `manage.py` | Django 项目管理入口，用于运行开发服务器、数据库迁移、创建应用等命令 |
| `requirements.txt` | Python 依赖清单（django, djangorestframework, simplejwt, celery, redis, openpyxl 等） |
| `celery.py` | Celery 应用实例，加载各 app 下的异步任务 |

## config/ — Django 项目配置

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `settings.py` | 全局配置：DRF、SimpleJWT、Celery、DATABASES、INSTALLED_APPS、中间件、静态文件等 |
| `urls.py` | 根路由分发，以 `/api/v1/` 为前缀，include 各 app 的 urls |
| `wsgi.py` | WSGI 应用入口，用于生产环境部署 |
| `asgi.py` | ASGI 应用入口，用于异步/WebSocket 部署 |

## apps/ — 业务应用模块

### apps/accounts/ — 用户认证模块

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `serializers.py` | LoginSerializer、TokenRefreshSerializer、UserSerializer |
| `views.py` | LoginView（登录）、RefreshView（刷新 token）、LogoutView（登出）、MeView（获取当前用户） |
| `urls.py` | `/auth/login/`、`/auth/refresh/`、`/auth/logout/`、`/auth/me/` 路由 |
| `permissions.py` | IsAdminUser（教务权限）、IsStudentUser（学生权限）自定义权限类 |

### apps/courses/ — 教务基础数据管理

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `models.py` | Course（课程）、Teacher（含禁排时间段）、Classroom（容量/多媒体设备）、Major（专业）、Student（学生）模型 |
| `serializers.py` | 各模型的 CRUD 序列化器 + 导入序列化器 |
| `views.py` | CourseViewSet、TeacherViewSet、ClassroomViewSet、MajorViewSet（分页查询/增删改查） |
| `urls.py` | `/admin/courses/`、`/admin/teachers/`、`/admin/classrooms/`、`/admin/majors/` 路由 |
| `import_export.py` | Excel 导入开课任务书、导出排课结果（使用 openpyxl） |

### apps/protected_slots/ — 辅修时段保护

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `models.py` | ProtectedSlot 模型（day 星期几、period 时段、reason 保护原因） |
| `serializers.py` | ProtectedSlotSerializer + BatchUpdateSerializer |
| `views.py` | ProtectedSlotViewSet（CRUD）+ BatchUpdateView（全量替换） |
| `urls.py` | `/admin/protected-slots/`、`/admin/protected-slots/{id}/`、`/admin/protected-slots/batch-update/` 路由 |

### apps/scheduling/ — 排课算法与方案生成（核心异步模块）

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `models.py` | SchedulePlan（方案元数据）、ScheduleEntry（课程-时间-教室映射）、TaskRecord（Celery 任务状态） |
| `serializers.py` | PlanSerializer、EntrySerializer、EvaluationSerializer |
| `views.py` | GenerateView（触发排课）、TaskStatusView（轮询任务）、PlanViewSet（方案 CRUD）、PublishView（发布）、ExportView（导出）、OverrideView（人工覆盖调整） |
| `urls.py` | `/admin/schedule/` 下 8 个端点路由 |
| `tasks.py` | Celery 异步任务 generate_schedule，调用 optimizer 排课后写入数据库 |

### apps/scheduling/algorithm/ — 排课算法包

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `genetic.py` | 遗传算法主循环：编码、初始化种群、选择、交叉、变异、迭代收敛 |
| `fitness.py` | 适应度函数：最小化每日课时方差 + 辅修保护时段惩罚 + 硬约束违规惩罚 |
| `constraints.py` | 硬约束检查：周学时上限、午休禁排、体育课后禁排理论课、教室容量、教师不可用时间 |
| `optimizer.py` | 调度入口：整合数据加载、约束初始化、算法运行、结果解码、写入数据库 |

### apps/conflict_analysis/ — 冲突预分析模块（异步）

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `models.py` | ConflictAnalysisResult（分析批次）、ConflictPair（冲突课程对 + 冲突学生人数） |
| `serializers.py` | 序列化器 |
| `views.py` | RunAnalysisView（触发分析）、TaskStatusView（轮询进度）、ResultViewSet（历史结果）、PairDetailView（冲突课程对详情） |
| `urls.py` | `/admin/conflict-analysis/` 下 4 个端点路由 |
| `tasks.py` | Celery 异步任务 run_conflict_analysis，扫描所有课程对统计冲突人数 |

### apps/algorithm_config/ — 算法参数热配置

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `models.py` | AlgorithmConfig 单例模型（变异率、种群大小、辅修保护权重等，存入缓存实现热更新） |
| `serializers.py` | AlgorithmConfigSerializer |
| `views.py` | AlgorithmConfigRetrieveUpdateView（获取/更新参数） |
| `urls.py` | `/admin/algorithm-config/` 路由 |

### apps/student/ — 学生端功能模块

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `serializers.py` | StudentScheduleSerializer、CourseListSerializer（含冲突标记）、ConflictDetailSerializer |
| `views.py` | ScheduleView（个人课表）、CourseListView（可选课程列表）、ConflictDetailView（冲突详情）、SelectCourseView（选课/二次校验）、DropCourseView（退课）、FreeSlotsView（空闲时段）、RecommendView（空闲推荐） |
| `urls.py` | `/student/` 下 7 个端点路由 |
| `bitmap.py` | 位图工具：生成课表位图、O(1) 冲突检测、空闲位图取反运算 |
| `recommendation.py` | 空闲时段课程推荐引擎：按空闲时段筛选该时段开设且符合培养方案的课程 |

### apps/common/ — 公共工具模块

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件 |
| `pagination.py` | 自定义分页配置（PageNumberPagination / LimitOffsetPagination），供所有 ViewSet 复用 |
| `mixins.py` | 通用 mixin 类（如 AsyncTaskMixin 封装异步任务的触发与轮询） |
| `utils.py` | 辅助函数集合（如日期计算、缓存封装、原生 SQL 兜底执行器等） |

## middleware/ — 自定义中间件

| 文件 | 描述 |
|------|------|
| `__init__.py` | 包标识文件，可在此目录下新增自定义中间件（如请求日志、统一异常处理等） |
