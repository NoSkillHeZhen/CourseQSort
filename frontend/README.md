# CourseQSort 排课规划器 — 前端

大学生选课 + 教务排课辅助系统前端。

---

## 项目结构

```
frontend/
├── index.html       # 登录页 — 登录（双模式）
├── student.html     # 学生端 — 选课主页
├── register.html    # 注册页
├── teacher.html     # 教师端 — 课表查看
├── schedule.html    # 学生端 — 课表打印
├── timetable.html   # 课表视图
├── admin.html       # 教务端 — 管理后台
├── css/
│   └── style.css
├── js/
│   ├── api.js       # API 对接层（双模式：Mock / 真实后端）
│   ├── script.js    # 学生端 UI 控制器
│   └── admin.js     # 教务端 UI 控制器
└── README.md
```

---

## 双模式说明

### 预览模式（默认）

无需任何后端服务，直接在浏览器打开 HTML 文件即可使用全部功能。
所有数据由 `api.js` 内置的 Mock 数据模拟。

### 后端模式

对接 Django REST Framework 后端。

切换方式（浏览器控制台执行）：

```javascript
CourseQSortAPI.setMockMode(false)
```

---

## 快速开始

### 预览模式（推荐，无需后端）

用浏览器直接打开 `index.html` → 选择「预览模式」→ 输入任意姓名和学号 → 进入选课系统。

或直接打开 `admin.html` 进入教务管理端。

### HBuilderX 预览

在 HBuilderX 中打开项目文件夹，右键 HTML 文件 →「运行」→「浏览器运行」。

### 后端模式（需配合 Django 后端）

```bash
# 1. 后端启动（假设后端在 localhost:8000）
cd backend/backend_code
python manage.py runserver 8000

# 2. 浏览器打开 index.html，切换到「后端模式」
# 3. 用 username + password 登录
```

---

## 功能清单

| 页面 | 功能 | 预览模式 | 后端模式 |
|------|------|---------|---------|
| index.html | 双模式登录（JWT / 模拟） | 姓名+学号 | username+password |
| student.html | 课程列表（分页） | 50门 Mock 课程 | GET /student/courses/ |
| student.html | 冲突检测 + 标记 | 客户端位图 O(1) | 后端返回 conflict 字段 |
| student.html | 选课 / 退课 | 本地模拟 | POST /select/ / DELETE /drop/ |
| student.html | 空闲时段推荐 | 客户端计算 | GET /free-slots/ + /recommend/ |
| schedule.html | 课表打印 | sessionStorage / API | GET /student/schedule/ |
| admin.html | 概览统计 | Mock 数据 | GET /admin/courses/teachers/... |
| admin.html | 课程管理 | Mock 50 门 | GET /admin/courses/ |
| admin.html | 基础资源（教师/教室/专业） | Mock 数据 | GET /admin/teachers/classrooms/majors/ |
| admin.html | 辅修时段保护 CRUD | Mock 数据 | GET/POST/DELETE /admin/protected-slots/ |
| admin.html | 排课方案生成 + 评估 + 发布 | 模拟异步任务 | POST/GET /admin/schedule/... |
| admin.html | 冲突预分析 + 柱状图 | 模拟异步任务 | POST/GET /admin/conflict-analysis/... |
| admin.html | 算法参数配置（滑块调参） | Mock 配置 | GET/PUT /admin/algorithm-config/ |

---

## 后端 API 端点（共 26 个）

认证：
```
POST   /api/v1/auth/login/          # JWT 登录
POST   /api/v1/auth/refresh/        # 刷新 Token
POST   /api/v1/auth/logout/         # 登出
GET    /api/v1/auth/me/             # 当前用户
```

学生端：
```
GET    /api/v1/student/schedule/                             # 个人课表 + 位图
GET    /api/v1/student/courses/?page=&page_size=             # 可选课程（分页）
GET    /api/v1/student/courses/{id}/conflict-detail/         # 冲突详情
POST   /api/v1/student/courses/{id}/select/                  # 选课
DELETE /api/v1/student/courses/{id}/drop/                    # 退课
GET    /api/v1/student/free-slots/                           # 空闲时段
GET    /api/v1/student/free-slots/{day}/{period}/recommend/  # 空闲推荐
```

教务端：
```
GET    /api/v1/admin/courses/                                 # 课程列表
POST   /api/v1/admin/courses/import/                          # 批量导入
GET    /api/v1/admin/teachers/                                # 教师列表
GET    /api/v1/admin/classrooms/                              # 教室列表
GET    /api/v1/admin/majors/                                  # 专业列表
GET    /api/v1/admin/protected-slots/                         # 保护时段列表
POST   /api/v1/admin/protected-slots/                         # 新增保护时段
DELETE /api/v1/admin/protected-slots/{id}/                    # 删除保护时段
PUT    /api/v1/admin/protected-slots/batch-update/            # 批量更新
POST   /api/v1/admin/schedule/generate/                       # 触发排课
GET    /api/v1/admin/schedule/tasks/{id}/                     # 排课进度
GET    /api/v1/admin/schedule/plans/                          # 方案列表
GET    /api/v1/admin/schedule/plans/{id}/evaluation/          # 方案评估
POST   /api/v1/admin/schedule/plans/{id}/publish/             # 发布方案
POST   /api/v1/admin/conflict-analysis/run/                   # 触发冲突分析
GET    /api/v1/admin/conflict-analysis/tasks/{id}/            # 分析进度
GET    /api/v1/admin/conflict-analysis/results/               # 分析结果列表
GET    /api/v1/admin/conflict-analysis/results/{id}/pairs/    # 冲突课程对
GET    /api/v1/admin/algorithm-config/                        # 获取算法配置
PUT    /api/v1/admin/algorithm-config/                        # 更新算法配置
```

详细接口合约见 `api/api_contract.md`（后端仓库）。

---

## 团队协作建议

1. 将此仓库推送到 GitHub
2. 后端同学依据 API 合约实现各端点
3. 前端在预览模式下独立开发和调试 UI
4. 后端接口就绪后，执行 `CourseQSortAPI.setMockMode(false)` 切到联调模式
5. 前端代码所有数据都通过 `api.js` 的 API 层获取，切到后端模式无需改 UI 代码

---

## 技术栈

```
纯 HTML / CSS / JavaScript（无框架依赖）
Bootstrap 5（CDN）
后端对接: Django REST Framework + SimpleJWT（JWT Token）
```

---

> 开发阶段由 [Codex](https://codex.ai) 辅助完成
