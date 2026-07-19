# CourseQSort Frontend

CourseQSort 前端为纯 HTML / CSS / JavaScript 实现，包含学生端、教师端、教务管理端，以及一套基于 Playwright 的端到端测试。

## 页面结构

```text
frontend/
├── index.html            登录页，支持 Mock / JWT 双模式
├── student.html          学生选课页
├── teacher.html          教师课表页
├── admin.html            教务管理页
├── schedule.html         学生打印课表页
├── timetable.html        课表视图页
├── register.html         注册页
├── css/style.css         样式
├── js/api.js             API 适配层，支持 Mock 和后端模式
├── js/script.js          学生端逻辑
├── js/admin.js           教务端逻辑
├── test-server.js        前端测试用静态服务器
├── tests/frontend.spec.js
├── tests/support.js
├── playwright.config.js
└── package.json
```

## 运行方式

### 预览模式

默认是 Mock 模式，不依赖后端。

直接在浏览器打开 `frontend/index.html`：

- 学生登录后跳转到 `student.html`
- 教师登录后跳转到 `teacher.html`
- 教务登录后跳转到 `admin.html`

### 后端联调模式

1. 启动后端：

```bash
cd backend
python manage.py runserver 8000
```

2. 浏览器打开 `frontend/index.html`
3. 切换到“后端模式”
4. 使用后端账号登录

如果需要在控制台手动切换，也可以执行：

```javascript
CourseQSortAPI.setMockMode(false)
```

## 当前前端能力

- `index.html`
  - Mock / JWT 双模式登录
- `student.html`
  - 课程列表分页
  - 冲突标记
  - 选课 / 退课
  - 空闲时段推荐
- `schedule.html`
  - 打印课表
- `teacher.html`
  - 教师课表查看
- `admin.html`
  - 仪表盘统计
  - 课程管理
  - 教师 / 教室 / 专业 / 学生 / 班级资源管理
  - 保护时段管理
  - 排课方案生成、查看、发布
  - 冲突分析
  - 算法参数配置

## 前端测试

前端自动化测试使用 Playwright。

安装依赖：

```bash
cd frontend
npm ci
```

首次本机运行如果缺少 Playwright 浏览器，可执行：

```bash
npx playwright install chromium
```

运行测试：

```bash
npm run test:e2e
```

可选命令：

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

当前测试覆盖：

- 学生 Mock 登录跳转
- 学生选课、退课、打印课表
- 教务端创建课程
- 教务端生成排课方案、查看冲突、保存算法参数

## CI

前端 GitHub Actions 工作流文件：

- `.github/workflows/frontend-ci.yml`

CI 流程包括：

- `npm ci`
- `npx playwright install --with-deps chromium`
- `npm run test:e2e`

## 注意事项

- 当前登录入口是 `index.html`，不是 `login.html`
- Playwright 测试使用 `test-server.js` 启动本地静态服务
- 本地 Playwright 配置优先复用已安装的 Chrome / Edge；CI 则使用工作流安装的 Chromium
