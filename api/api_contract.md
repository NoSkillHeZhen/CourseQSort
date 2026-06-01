# 排课规划器 — API 接口契约

> 技术栈：Django REST Framework + SimpleJWT + Celery
>
> Base URL：`/api/v1/`
>
> 数据格式：请求/响应均为 JSON
>
> 认证方式：`Authorization: Bearer <access_token>`

---

## 目录

1. [认证模块](#1-认证模块)
2. [教务端 — 基础数据管理](#2-教务端--基础数据管理)
3. [教务端 — 辅修时段保护](#3-教务端--辅修时段保护)
4. [教务端 — 排课算法与方案生成（异步）](#4-教务端--排课算法与方案生成异步)
5. [教务端 — 冲突预分析（异步）](#5-教务端--冲突预分析异步)
6. [教务端 — 算法参数热配置](#6-教务端--算法参数热配置)
7. [学生端 — 课表与冲突检测](#7-学生端--课表与冲突检测)
8. [学生端 — 空闲时段推荐](#8-学生端--空闲时段推荐)

---

## 1. 认证模块

### 1.1 登录

- **URL**: `POST /api/v1/auth/login/`
- **权限**: 公开
- **功能**: 用户使用用户名和密码登录，返回 JWT token 对及用户基本信息。
- **使用场景**: 教务/学生首次进入系统时调用，前端将 `access_token` 存入本地存储并在后续请求的 `Authorization` 头中携带。

**Request**:

```json
{
  "username": "admin",
  "password": "your_password"
}
```

**Response 200**:

```json
{
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "ADMIN",
    "name": "张教务"
  }
}
```

**Error 401**:

```json
{ "detail": "No active account found with the given credentials" }
```

[常见的http错误码](https://www.runoob.com/http/http-status-codes.html)

---

### 1.2 刷新 Token

- **URL**: `POST /api/v1/auth/refresh/`
- **权限**: 公开
- **功能**: 使用 `refresh_token` 获取新的 `access_token`。`access_token` 过期后（默认 30 分钟），前端应用自动调用此接口静默续期。
- **使用场景**: 前端 axios 拦截器检测到 401 时自动调用。

**Request**:

```json
{ "refresh": "eyJhbGciOiJIUzI1NiIs..." }
```

**Response 200**:

```json
{ "access": "eyJhbGciOiJIUzI1NiIs..." }
```

> *~~百万token~~
> 但是很明显api token和llm里面的token不是一个东西*

---

### 1.3 登出

- **URL**: `POST /api/v1/auth/logout/`
- **权限**: 已认证用户
- **功能**: 将当前 `refresh_token` 加入黑名单，服务端使其失效。
- **使用场景**: 用户点击退出登录时调用。

**Request**:

```json
{ "refresh": "eyJhbGciOiJIUzI1NiIs..." }
```

**Response 200**:

```json
{ "detail": "Successfully logged out" }
```

> *response后面的数字和前面的那个401错误都是http状态码*

---

### 1.4 获取当前用户信息

- **URL**: `GET /api/v1/auth/me/`
- **权限**: 已认证用户
- **功能**: 获取当前登录用户的详细信息，前端用于身份识别和权限判断。
- **使用场景**: 页面刷新后或路由跳转时校验用户身份。

**Response 200**:

```json
{
  "id": 1,
  "username": "admin",
  "role": "ADMIN",
  "name": "张教务",
  "email": "zhang@university.edu.cn",
  "major": null
}
```

---

## 2. 教务端 — 基础数据管理

### 2.1 课程列表

- **URL**: `GET /api/v1/admin/courses/`
- **权限**: 教务
- **查询参数**:

| 参数                | 类型   | 必填 | 说明                         |
| ------------------- | ------ | ---- | ---------------------------- |
| `page`            | int    | 否   | 页码，默认 1                 |
| `page_size`       | int    | 否   | 每页条数，默认 20            |
| `semester`        | string | 否   | 学期筛选，如 `2026-spring` |
| `major`           | int    | 否   | 专业 ID                      |
| `keyword`         | string | 否   | 课程名称/编码模糊搜索        |
| `is_professional` | bool   | 否   | 是否专业课                   |

- **功能**: 分页查询课程列表，支持按学期、专业、关键词筛选。
- **使用场景**: 教务查看和管理开课任务书中的所有课程。

**Response 200**:

```json
{
  "count": 200,
  "next": "http://.../api/v1/admin/courses/?page=2",
  "previous": null,
  "results": [
    {
      "id": 101,
      "name": "数据结构",
      "code": "CS201",
      "credit": 3,
      "hours": 48,
      "major": { "id": 1, "name": "计算机科学与技术" },
      "teachers": [{ "id": 201, "name": "王教授" }],
      "required_classroom_types": ["普通教室", "多媒体"],
      "expected_student_count": 120,
      "is_professional_course": true
    }
  ]
}
```

---

### 2.2 课程详情

- **URL**: `GET /api/v1/admin/courses/{id}/`
- **权限**: 教务
- **功能**: 获取单门课程的完整信息。
- **使用场景**: 教务查看某门课程的详细信息或进行编辑前回填表单。

**Response 200**:

```json
{
  "id": 101,
  "name": "数据结构",
  "code": "CS201",
  "credit": 3,
  "hours": 48,
  "major": { "id": 1, "name": "计算机科学与技术" },
  "teachers": [{ "id": 201, "name": "王教授" }],
  "required_classroom_types": ["普通教室", "多媒体"],
  "expected_student_count": 120,
  "is_professional_course": true,
  "prerequisites": [],
  "semester": "2026-spring",
  "created_at": "2026-05-01T10:00:00Z"
}
```

---

### 2.3 创建/修改/删除课程

- **URL**: `POST /api/v1/admin/courses/`
- **URL**: `PATCH /api/v1/admin/courses/{id}/`
- **URL**: `DELETE /api/v1/admin/courses/{id}/`
- **权限**: 教务
- **功能**: 对课程进行增删改操作。
- **使用场景**: 教务手动添加个别课程或删除错误导入的课程。

**POST Request**:

```json
{
  "name": "人工智能导论",
  "code": "CS301",
  "credit": 3,
  "hours": 48,
  "major_id": 1,
  "teacher_ids": [201, 202],
  "required_classroom_types": ["多媒体"],
  "expected_student_count": 120,
  "is_professional_course": true
}
```

**Response 201**: 创建成功，返回课程详情

> *URL：API端点规则，路由匹配*
>
> *路由：根据URL和http方法找到对应处理函数（视图）的映射关系*
>
> *视图：接收请求、处理业务逻辑、返回响应的函数或类。*

---

### 2.4 批量导入课程（开课任务书）

- **URL**: `POST /api/v1/admin/courses/import/`
- **权限**: 教务
- **请求格式**: `multipart/form-data`
- **字段**: `file` — Excel 文件（`.xlsx`）
- **功能**: 批量导入下学期开课任务书，逐行校验数据合法性并返回导入结果。
- **使用场景**: 新学期开始，教务从现有教务系统导出开课任务书 Excel 后，直接上传到本系统。

**Response 201**:

```json
{
  "imported_count": 150,
  "errors": [
    { "row": 5, "reason": "教师工号 1001 不存在" },
    { "row": 12, "reason": "学分格式错误" }
  ]
}
```

> *Issue：用的是excel还是json格式的课程表*

---

### 2.5 教师列表

- **URL**: `GET /api/v1/admin/teachers/`
- **权限**: 教务
- **查询参数**: `page`, `page_size`, `keyword`
- **功能**: 分页查询教师列表，用于课程编排时选择授课教师。
- **使用场景**: 教务查看和管理教师资源。

**Response 200**:

```json
{
  "count": 80,
  "results": [
    {
      "id": 201,
      "name": "王教授",
      "employee_no": "T001",
      "department": "计算机学院",
      "unavailable_slots": [
        { "day_of_week": 1, "period": 1 },
        { "day_of_week": 5, "period": 5 }
      ]
    }
  ]
}
```

---

### 2.6 教室列表

- **URL**: `GET /api/v1/admin/classrooms/`
- **权限**: 教务
- **功能**: 教室资源列表，包含容量、设备类型等信息，用于排课时匹配教室约束。

**Response 200**:

```json
{
  "count": 30,
  "results": [
    {
      "id": 1,
      "name": "A101",
      "capacity": 120,
      "building": "教学楼A",
      "equipment_types": ["多媒体", "黑板"],
      "is_lab": false
    }
  ]
}
```

---

### 2.7 专业列表

- **URL**: `GET /api/v1/admin/majors/`
- **权限**: 教务
- **功能**: 获取所有专业/班级列表。

**Response 200**:

```json
{
  "count": 5,
  "results": [
    { "id": 1, "name": "计算机科学与技术", "code": "CS", "student_count": 120 },
    { "id": 2, "name": "软件工程", "code": "SE", "student_count": 80 }
  ]
}
```

---

### 2.8 某专业下学生名单

- **URL**: `GET /api/v1/admin/majors/{id}/students/`
- **权限**: 教务
- **功能**: 获取指定专业下的所有学生列表。
- **使用场景**: 排课算法启动前，教务查看该专业学生信息；算法内部在编排专业课时间时，需要遍历所有学生的课表进行均衡度计算。

**Response 200**:

```json
{
  "count": 120,
  "results": [
    { "id": 2024001, "student_no": "2024001", "name": "张三" },
    { "id": 2024002, "student_no": "2024002", "name": "李四" }
  ]
}
```

---

## 3. 教务端 — 辅修时段保护

### 3.1 获取所有受保护时段

- **URL**: `GET /api/v1/admin/protected-slots/`
- **权限**: 教务
- **功能**: 获取当前教务已设置的所有辅修热门保护时段。
- **使用场景**: 教务进入辅修时段管理页面时加载已有数据。

**Response 200**:

```json
{
  "count": 5,
  "results": [
    {
      "id": 1,
      "day_of_week": 2,
      "start_period": 3,
      "end_period": 4,
      "penalty_weight": 8.0,
      "description": "辅修热门时段-周二三四节"
    },
    {
      "id": 2,
      "day_of_week": 4,
      "start_period": 5,
      "end_period": 6,
      "penalty_weight": 7.5,
      "description": "辅修热门时段-周四五六节"
    }
  ]
}
```

---

### 3.2 新增受保护时段

- **URL**: `POST /api/v1/admin/protected-slots/`
- **权限**: 教务
- **功能**: 添加一个辅修热门保护时段。在排课算法运行时，该时段会被施加惩罚权重，使专业课尽量避开该时段，除非没有其他可用时间段。
- **使用场景**: 教务根据往年选课数据或学校政策，标记辅修课程集中的热门时段。

**Request**:

```json
{
  "day_of_week": 2,
  "start_period": 3,
  "end_period": 4,
  "penalty_weight": 8.0,
  "description": "辅修热门时段-周二三四节"
}
```

**Response 201**:

```json
{
  "id": 1,
  "day_of_week": 2,
  "start_period": 3,
  "end_period": 4,
  "penalty_weight": 8.0,
  "description": "辅修热门时段-周二三四节"
}
```

**说明**: `start_period` 和 `end_period` 表示第几大节（1~11），可连续包含多个节次。`penalty_weight` 取值范围 0~10，值越大算法越倾向于避开该时段。

---

### 3.3 修改/删除受保护时段

- **URL**: `PATCH /api/v1/admin/protected-slots/{id}/`
- **URL**: `DELETE /api/v1/admin/protected-slots/{id}/`
- **权限**: 教务
- **功能**: 修改或删除单个已设保护时段。
- **使用场景**: 教务发现标记有误或政策调整时进行修改。

**PATCH Request**:

```json
{ "penalty_weight": 9.5, "description": "权重上调-该时段辅修选课密集" }
```

**Response 200**: 返回更新后的完整对象

---

### 3.4 批量更新保护时段

- **URL**: `PUT /api/v1/admin/protected-slots/batch-update/`
- **权限**: 教务
- **功能**: 一次性替换所有保护时段（全量覆盖）。
- **使用场景**: 教务从系统外部统一规划好整学期的辅修时段安排后，一次性导入。

**Request**:

```json
[
  { "day_of_week": 1, "start_period": 3, "end_period": 4, "penalty_weight": 8.0, "description": "周一三四节" },
  { "day_of_week": 3, "start_period": 7, "end_period": 8, "penalty_weight": 6.0, "description": "周三七八节" }
]
```

**Response 200**:

```json
{ "updated_count": 2 }
```

---

## 4. 教务端 — 排课算法与方案生成（异步）

### 4.1 触发排课方案生成

- **URL**: `POST /api/v1/admin/schedule/generate/`
- **权限**: 教务
- **功能**: 异步启动排课算法引擎。系统获取指定专业下的所有学生名单及已排课分布，使用遗传算法（或模拟退火算法）进行迭代求解。算法在满足硬约束（教室容量、教师禁排、体育课后禁排理论课、周学时上限、午休禁排）的前提下，以最小化学生每日课时方差为目标进行优化。辅修保护时段会以惩罚权重的形式嵌入适应度函数。任务进入 Celery 队列，返回 `task_id` 供前端轮询进度。
- **使用场景**: 教务导入开课任务书、配置好算法参数和保护时段后，点击"生成排课方案"按钮。

**Request**:

```json
{
  "plan_name": "2026春-计算机学院-初版",
  "semester": "2026-spring",
  "major_ids": [1, 2, 3],
  "algorithm_config": {
    "population_size": 200,
    "max_generations": 500,
    "mutation_rate": 0.05,
    "crossover_rate": 0.85,
    "variance_weight": 0.6,
    "conflict_penalty_weight": 0.4
  }
}
```

**Response 202**:

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING"
}
```

**说明**:

- `variance_weight`（均衡度权重）与 `conflict_penalty_weight`（冲突惩罚权重）之和应为 1
- 算法处理千人规模学院应在 5 分钟内收敛
- 算法会从 DB 中自动加载当前 `AlgorithmConfig` 和 `ProtectedSlot` 设置

---

### 4.2 查询生成任务状态

- **URL**: `GET /api/v1/admin/schedule/tasks/{task_id}/`
- **权限**: 教务
- **功能**: 轮询排课任务的当前状态、进度和当前最优适应度。
- **使用场景**: 前端发起生成请求后，每隔 2~3 秒调用此接口更新进度条和状态显示。

**Response 200 (运行中)**:

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "RUNNING",
  "progress": 0.65,
  "current_generation": 325,
  "best_fitness": 0.87,
  "estimated_time_remaining": "45s",
  "error_message": null
}
```

**Response 200 (完成)**:

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "SUCCESS",
  "progress": 1.0,
  "current_generation": 500,
  "best_fitness": 0.93,
  "plan_id": 1,
  "estimated_time_remaining": null,
  "error_message": null
}
```

**Response 200 (失败)**:

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "progress": 0.3,
  "current_generation": 150,
  "best_fitness": null,
  "estimated_time_remaining": null,
  "error_message": "教室资源不足：A101 在周一第二节已被分配"
}
```

**状态枚举**:

| status      | 说明                 |
| ----------- | -------------------- |
| `PENDING` | 任务等待队列         |
| `RUNNING` | 算法执行中           |
| `SUCCESS` | 生成完成，可查看方案 |
| `FAILED`  | 算法执行失败         |

---

### 4.3 历史方案列表

- **URL**: `GET /api/v1/admin/schedule/plans/`
- **权限**: 教务
- **功能**: 分页查询所有已生成的排课方案，按创建时间倒序。

**Response 200**:

```json
{
  "count": 10,
  "results": [
    {
      "id": 1,
      "plan_name": "2026春-计算机学院-初版",
      "semester": "2026-spring",
      "major_ids": [1, 2, 3],
      "overall_fitness": 0.93,
      "status": "DRAFT",
      "created_at": "2026-05-20T10:30:00Z",
      "created_by": "张教务"
    }
  ]
}
```

---

### 4.4 方案详情

- **URL**: `GET /api/v1/admin/schedule/plans/{id}/`
- **权限**: 教务
- **功能**: 获取某个排课方案的完整详情，包含所有排课条目（课程-教师-教室-时间-学生群的分配结果）。

**Response 200**:

```json
{
  "id": 1,
  "plan_name": "2026春-计算机学院-初版",
  "semester": "2026-spring",
  "major_ids": [1, 2, 3],
  "overall_fitness": 0.93,
  "status": "DRAFT",
  "algorithm_config": { ... },
  "created_at": "2026-05-20T10:30:00Z",
  "created_by": "张教务",
  "items": [
    {
      "id": 1,
      "course": { "id": 101, "name": "数据结构" },
      "teacher": { "id": 201, "name": "王教授" },
      "classroom": { "id": 1, "name": "A101" },
      "day_of_week": 1,
      "period": 2,
      "student_group_ids": [2024001, 2024002, ...]
    }
  ]
}
```

---

### 4.5 方案评估指标

- **URL**: `GET /api/v1/admin/schedule/plans/{id}/evaluation/`
- **权限**: 教务
- **功能**: 获取方案的质量评估数据，用于教务判断方案是否均衡。
- **使用场景**: 方案生成后，教务端仪表盘展示评估结果 — 包括日课时方差、每日课时分布（用于折线图/饼图）等。

**Response 200**:

```json
{
  "plan_id": 1,
  "overall_fitness": 0.93,
  "daily_hour_variance": 2.3,
  "max_daily_hours": 10,
  "min_daily_hours": 0,
  "student_count": 360,
  "class_count": 12,
  "daily_distribution": {
    "monday": 36,
    "tuesday": 48,
    "wednesday": 42,
    "thursday": 50,
    "friday": 30
  },
  "total_course_hours": 206,
  "protected_slot_occupied": 0,
  "hard_constraint_violations": []
}
```

**指标说明**:

| 字段                           | 说明                                       |
| ------------------------------ | ------------------------------------------ |
| `overall_fitness`            | 总体适应度（0~1），越接近 1 越好           |
| `daily_hour_variance`        | 所有学生日均课时的方差，越小越均衡         |
| `daily_distribution`         | 各天排课总课时数，供前端绘制折线/饼图      |
| `protected_slot_occupied`    | 排课时侵占辅修保护时段的课程数，应尽量为 0 |
| `hard_constraint_violations` | 硬约束违反列表（如有）                     |

---

### 4.6 发布方案

- **URL**: `POST /api/v1/admin/schedule/plans/{id}/publish/`
- **权限**: 教务
- **功能**: 将草稿状态方案发布为正式方案。发布后学生端可见，且不可再编辑排课条目。
- **使用场景**: 教务确认方案质量后，正式发布供学生选课使用。

**Response 200**:

```json
{
  "plan_id": 1,
  "status": "PUBLISHED",
  "published_at": "2026-05-22T09:00:00Z"
}
```

---

### 4.7 导出 Excel

- **URL**: `POST /api/v1/admin/schedule/plans/{id}/export/`
- **权限**: 教务
- **功能**: 将排课方案导出为 Excel 调整建议文件（`.xlsx`），用于回传至现有教务系统。
- **使用场景**: 教务需要将排课结果导入原教务系统时，下载标准格式的 Excel。

**Response 200**: 二进制文件下载（`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`）

---

### 4.8 人工覆盖调整

- **URL**: `POST /api/v1/admin/schedule/plans/{id}/override/`
- **权限**: 教务
- **功能**: 对某门课程的时间/教室/教师进行人工覆盖调整，调整后系统自动重新评估方案质量指标。
- **使用场景**: 教务发现某门课程安排不合理，手动拖拽调整时间或更换教室后提交。

**Request**:

```json
{
  "course_id": 101,
  "day_of_week": 3,
  "period": 4,
  "classroom_id": 2,
  "teacher_id": 202,
  "reason": "原安排与教师会议冲突"
}
```

**Response 200**:

```json
{
  "item_id": 15,
  "evaluation": { ... }
}
```

---

## 5. 教务端 — 冲突预分析（异步）

### 5.1 触发冲突预分析

- **URL**: `POST /api/v1/admin/conflict-analysis/run/`
- **权限**: 教务
- **功能**: 异步启动冲突预分析任务。系统基于学生选课意愿数据（调查问卷导入或其他方式获取），遍历所有课程对，判断上课时间是否重叠且选课学生交集非空，计算冲突人数和冲突率。仅返回冲突人数超过 `threshold` 的课程对。该结果供前端以柱状图形式展示，帮助教务提前发现大面积"撞车"风险并人工介入调整。
- **使用场景**: 正式发布课表前，教务调用此接口进行冲突风险扫描。

**Request**:

```json
{
  "semester": "2026-spring",
  "course_ids": [101, 102, 103, ...],
  "threshold": 30
}
```

**Response 202**:

```json
{ "task_id": "660e8400-e29b-41d4-a716-446655440001", "status": "PENDING" }
```

---

### 5.2 查询分析进度

- **URL**: `GET /api/v1/admin/conflict-analysis/tasks/{task_id}/`
- **权限**: 教务
- **功能**: 轮询冲突预分析任务的进度。
- **使用场景**: 前端发起分析请求后轮询进度。

**Response 200**:

```json
{
  "task_id": "660e8400-...",
  "status": "RUNNING",
  "progress": 0.5,
  "analyzed_pairs": 1200,
  "total_pairs": 2400,
  "conflict_pairs_found": 15
}
```

---

### 5.3 历史分析结果列表

- **URL**: `GET /api/v1/admin/conflict-analysis/results/`
- **权限**: 教务
- **功能**: 获取历史冲突分析结果列表。

**Response 200**:

```json
{
  "count": 5,
  "results": [
    {
      "id": 1,
      "semester": "2026-spring",
      "course_count": 50,
      "conflict_pairs_count": 15,
      "threshold": 30,
      "created_at": "2026-05-21T14:00:00Z"
    }
  ]
}
```

---

### 5.4 冲突课程对详情（柱状图数据）

- **URL**: `GET /api/v1/admin/conflict-analysis/results/{id}/pairs/`
- **权限**: 教务
- **查询参数**: `threshold`（冲突人数阈值，可选，用于动态调整展示范围）
- **功能**: 获取某次分析的所有冲突课程对及其冲突人数，供前端绘制柱状图。
- **使用场景**: 教务端冲突分析页面展示柱状图，X 轴为冲突课程对名称，Y 轴为冲突学生数量。

**Response 200**:

```json
{
  "count": 15,
  "results": [
    {
      "course_a": { "id": 101, "name": "数据结构" },
      "course_b": { "id": 207, "name": "经济学原理" },
      "conflicting_student_count": 56,
      "conflict_rate": 0.47
    },
    {
      "course_a": { "id": 102, "name": "操作系统" },
      "course_b": { "id": 305, "name": "人工智能导论" },
      "conflicting_student_count": 42,
      "conflict_rate": 0.35
    }
  ]
}
```

**字段说明**:

- `conflicting_student_count`: 同时选了这两门课且时间冲突的学生数
- `conflict_rate`: 冲突学生数 / 两门课选课学生总交集（选课意愿中的重叠人数），反映冲突的严重程度

---

## 6. 教务端 — 算法参数热配置

### 6.1 获取算法配置

- **URL**: `GET /api/v1/admin/algorithm-config/`
- **权限**: 教务
- **功能**: 获取当前的算法参数配置。教务可通过前端滑块组件调整参数，无需修改代码或重启服务。

**Response 200**:

```json
{
  "variance_weight": 0.6,
  "conflict_penalty_weight": 0.4,
  "protected_slot_penalty": 8.0,
  "population_size": 200,
  "max_generations": 500,
  "mutation_rate": 0.05,
  "crossover_rate": 0.85,
  "timeout_seconds": 300,
  "updated_at": "2026-05-20T10:30:00Z",
  "updated_by": "张教务"
}
```

**参数说明**:

| 参数                        | 类型  | 范围     | 说明                                          |
| --------------------------- | ----- | -------- | --------------------------------------------- |
| `variance_weight`         | float | 0~1      | 均衡度权重，越大越注重课表均衡                |
| `conflict_penalty_weight` | float | 0~1      | 冲突惩罚权重，与 `variance_weight` 之和为 1 |
| `protected_slot_penalty`  | float | 0~10     | 辅修时段惩罚基数，越大越避免占用              |
| `population_size`         | int   | 50~500   | 遗传算法种群大小                              |
| `max_generations`         | int   | 100~2000 | 最大迭代代数                                  |
| `mutation_rate`           | float | 0~0.2    | 变异率                                        |
| `crossover_rate`          | float | 0.5~1.0  | 交叉率                                        |
| `timeout_seconds`         | int   | 60~600   | 算法超时时间                                  |

---

### 6.2 更新算法配置

- **URL**: `PUT /api/v1/admin/algorithm-config/`
- **权限**: 教务
- **功能**: 更新算法配置（支持部分字段更新）。保存后即时生效，下一次排课任务启动时自动加载新配置，无需重启服务。
- **使用场景**: 教务通过前端 UI 滑块调节参数，提交后立刻生效。

**Request**:

```json
{
  "variance_weight": 0.7,
  "protected_slot_penalty": 9.0
}
```

**Response 200**: 返回更新后的完整配置

---

## 7. 学生端 — 课表与冲突检测

### 7.1 获取个人课表

- **URL**: `GET /api/v1/student/schedule/`
- **权限**: 学生
- **功能**: 获取当前学生的已选课表，包含每门课的时间信息和完整的时间位图（bitmap）。前端拿到位图后，可在本地进行按位与运算实现毫秒级冲突检测，避免频繁请求后端。
- **使用场景**: 学生登录后首次加载课表页、选课前初始化位图数据。

**Response 200**:

```json
{
  "student_id": 2024001,
  "semester": "2026-spring",
  "bitmap": "0xFF00FF00FF00FF00FFFF",
  "courses": [
    {
      "course_id": 101,
      "name": "数据结构",
      "teacher": "王教授",
      "time_slots": [
        { "day_of_week": 1, "period": 2 },
        { "day_of_week": 3, "period": 2 }
      ],
      "classroom": "A101"
    },
    {
      "course_id": 102,
      "name": "操作系统",
      "teacher": "李教授",
      "time_slots": [
        { "day_of_week": 2, "period": 4 },
        { "day_of_week": 4, "period": 4 }
      ],
      "classroom": "B201"
    }
  ]
}
```

**位图说明**：位图为一个 55 位二进制串（5 天 × 11 节/天），每个 bit 表示该时间段是否已被占用。前端将待选课程的时间位图与已选课表位图做按位与，结果非零则表示冲突。

---

### 7.2 可选课程列表（含冲突标记）

- **URL**: `GET /api/v1/student/courses/`
- **权限**: 学生
- **查询参数**:

| 参数          | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| `major`     | int    | 否   | 所属专业         |
| `keyword`   | string | 否   | 课程名称模糊搜索 |
| `page`      | int    | 否   | 页码             |
| `page_size` | int    | 否   | 每页条数         |

- **功能**: 获取当前学期学生可选的所有课程列表，每门课附带其时间信息和冲突标记。冲突检测逻辑：前端用本地已选位图与每门课的时间位图做按位与，若冲突则将课程标灰并显示红色"冲突"标签。后端也可额外同步返回 `conflict` 字段和 `conflict_with` 列表，便于前端直接渲染（双保险）。
- **使用场景**: 学生进入选课页面时加载课程列表。

**Response 200**:

```json
{
  "count": 50,
  "results": [
    {
      "course_id": 101,
      "name": "数据结构",
      "credit": 3,
      "teacher": "王教授",
      "capacity": 120,
      "enrolled_count": 95,
      "time_slots": [
        { "day_of_week": 1, "period": 2 }
      ],
      "remaining_capacity": 25,
      "conflict": true,
      "conflict_with": [
        {
          "course_id": 207,
          "name": "经济学原理",
          "time_slots": [{ "day_of_week": 1, "period": 2 }]
        }
      ]
    },
    {
      "course_id": 305,
      "name": "人工智能导论",
      "credit": 2,
      "teacher": "李教授",
      "capacity": 100,
      "enrolled_count": 40,
      "time_slots": [
        { "day_of_week": 3, "period": 5 }
      ],
      "remaining_capacity": 60,
      "conflict": false,
      "conflict_with": []
    }
  ]
}
```

**交互说明**: 前端根据 `conflict` 字段：

- 若 `conflict: true` → 课程行显示为灰色，标注红色"冲突"标签
- 鼠标悬停冲突标签 → 弹窗显示 `conflict_with` 中的课程名称和时间详情
- 点击冲突标签 → 路由跳转到课表视图，传入高亮参数

---

### 7.3 冲突详情（追溯）

- **URL**: `GET /api/v1/student/courses/{id}/conflict-detail/`
- **权限**: 学生
- **功能**: 获取某门课与已选课表中所有冲突课程的详细信息，包括冲突的具体时间段和位图对比。前端用于弹出层展示完整的冲突追溯信息。
- **使用场景**: 学生在选课时点击冲突标签上的"查看详情"，弹窗展示所有冲突位置。

**Response 200**:

```json
{
  "course_id": 101,
  "course_name": "数据结构",
  "course_time_slots": [
    { "day_of_week": 1, "period": 2 }
  ],
  "conflict_courses": [
    {
      "course_id": 207,
      "name": "经济学原理",
      "teacher": "赵老师",
      "day_of_week": 1,
      "period": 2,
      "classroom": "C301",
      "conflict_type": "TIME_OVERLAP"
    }
  ],
  "bitmap": "0xFFFF...",
  "conflict_bitmap": "0x00F0..."
}
```

**字段说明**:

- `bitmap`: 该课程的完整时间位图
- `conflict_bitmap`: 冲突时间段位图（与已选课表重叠的位）
- `conflict_type`: 固定为 `TIME_OVERLAP`（时间重叠）

---

### 7.4 选课

- **URL**: `POST /api/v1/student/courses/{id}/select/`
- **权限**: 学生
- **功能**: 学生选择一门课程。服务端进行二次冲突校验和容量校验，成功则添加至学生课表。
- **使用场景**: 学生点击选课按钮时调用。

**Response 201**:

```json
{
  "course_id": 101,
  "status": "SELECTED",
  "message": "选课成功"
}
```

**Error 409 (冲突)**:

```json
{
  "course_id": 101,
  "status": "CONFLICT",
  "message": "课程时间与已选课程「经济学原理」冲突",
  "conflict_detail": { ... }
}
```

**Error 409 (容量已满)**:

```json
{
  "course_id": 101,
  "status": "FULL",
  "message": "该课程容量已满（120/120）"
}
```

---

### 7.5 退课

- **URL**: `DELETE /api/v1/student/courses/{id}/drop/`
- **权限**: 学生
- **功能**: 学生退选某门课程，从个人课表中移除。

**Response 200**:

```json
{
  "course_id": 101,
  "status": "DROPPED",
  "message": "退课成功"
}
```

---

## 8. 学生端 — 空闲时段推荐

### 8.1 获取空闲时段

- **URL**: `GET /api/v1/student/free-slots/`
- **权限**: 学生
- **功能**: 基于当前学生已选课表的位图取反，得到所有空闲时段。
- **使用场景**: 选课页面侧边栏展示空闲时段列表，供学生点击筛选课程。

**Response 200**:

```json
{
  "free_slots": [
    { "day_of_week": 1, "period": 3, "label": "周一第三四节" },
    { "day_of_week": 1, "period": 5, "label": "周一第五六节" },
    { "day_of_week": 2, "period": 5, "label": "周二第九十节" },
    { "day_of_week": 4, "period": 1, "label": "周四第一二节" }
  ]
}
```

**说明**：空闲时段按照 `day_of_week` 和 `period` 排序返回，便于前端渲染为一个"课表周视图"中的空白格子。

---

### 8.2 空闲时段课程推荐

- **URL**: `GET /api/v1/student/free-slots/{day}/{period}/recommend/`
- **权限**: 学生
- **查询参数**:

| 参数         | 类型   | 必填 | 说明                             |
| ------------ | ------ | ---- | -------------------------------- |
| `major`    | int    | 否   | 专业 ID，用于筛选课程类别        |
| `category` | string | 否   | 学分类别（如"专业选修"、"通识"） |

- **功能**: 查询在指定空闲时段开设且符合学生培养方案要求的课程列表。
- **使用场景**: 学生在选课页面侧边栏点击一个空闲时段格子，右侧展示该时段可选的课程列表。

**Response 200**:

```json
{
  "day_of_week": 1,
  "period": 3,
  "courses": [
    {
      "course_id": 305,
      "name": "人工智能导论",
      "credit": 2,
      "category": "专业选修",
      "satisfy_training_plan": true,
      "remaining_capacity": 25,
      "teacher": "李教授",
      "classroom": "B201",
      "time_slots": [{ "day_of_week": 1, "period": 3 }]
    },
    {
      "course_id": 401,
      "name": "西方经济学",
      "credit": 3,
      "category": "通识选修",
      "satisfy_training_plan": true,
      "remaining_capacity": 60,
      "teacher": "陈教授",
      "classroom": "D101",
      "time_slots": [{ "day_of_week": 1, "period": 3 }]
    }
  ]
}
```

**字段说明**:

- `satisfy_training_plan`: 该课程是否满足该学生培养方案中的学分类别要求
- `category`: 课程类别（专业必修、专业选修、通识选修、辅修课程等）

---

## 附录：Django URL 路由总览

```python
# urls.py 结构

# 认证
POST   /api/v1/auth/login/
POST   /api/v1/auth/refresh/
POST   /api/v1/auth/logout/
GET    /api/v1/auth/me/

# 基础数据（ModelViewSet）
GET    /api/v1/admin/courses/
POST   /api/v1/admin/courses/
GET    /api/v1/admin/courses/{id}/
PATCH  /api/v1/admin/courses/{id}/
DELETE /api/v1/admin/courses/{id}/
GET    /api/v1/admin/teachers/
GET    /api/v1/admin/classrooms/
GET    /api/v1/admin/majors/
GET    /api/v1/admin/majors/{id}/students/

# 导入
POST   /api/v1/admin/courses/import/

# 辅修保护时段（ModelViewSet）
GET    /api/v1/admin/protected-slots/
POST   /api/v1/admin/protected-slots/
PATCH  /api/v1/admin/protected-slots/{id}/
DELETE /api/v1/admin/protected-slots/{id}/
PUT    /api/v1/admin/protected-slots/batch-update/

# 排课方案
POST   /api/v1/admin/schedule/generate/
GET    /api/v1/admin/schedule/tasks/{task_id}/
GET    /api/v1/admin/schedule/plans/
GET    /api/v1/admin/schedule/plans/{id}/
GET    /api/v1/admin/schedule/plans/{id}/evaluation/
POST   /api/v1/admin/schedule/plans/{id}/publish/
POST   /api/v1/admin/schedule/plans/{id}/export/
POST   /api/v1/admin/schedule/plans/{id}/override/

# 冲突预分析
POST   /api/v1/admin/conflict-analysis/run/
GET    /api/v1/admin/conflict-analysis/tasks/{task_id}/
GET    /api/v1/admin/conflict-analysis/results/
GET    /api/v1/admin/conflict-analysis/results/{id}/pairs/

# 算法参数
GET    /api/v1/admin/algorithm-config/
PUT    /api/v1/admin/algorithm-config/

# 学生端
GET    /api/v1/student/schedule/
GET    /api/v1/student/courses/
GET    /api/v1/student/courses/{id}/conflict-detail/
POST   /api/v1/student/courses/{id}/select/
DELETE /api/v1/student/courses/{id}/drop/
GET    /api/v1/student/free-slots/
GET    /api/v1/student/free-slots/{day}/{period}/recommend/
```
