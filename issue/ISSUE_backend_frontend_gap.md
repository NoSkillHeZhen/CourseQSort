# Issue

## #1 后端已实现课程 Excel 导入，但前端未实现

描述：后端已在 `backend/apps/courses/views.py` 中实现 `CourseImportView`，并提供 `POST /admin/courses/import/`。但前端 `frontend/js/admin.js` 中“导入 Excel”按钮仍然只是提示，没有文件上传、表单构造和接口调用。

## #2 后端已实现课程 JSON 导入，但前端未实现

描述：后端已在 `backend/apps/courses/management/commands/import_from_crawled_json.py` 中实现 JSON 导入命令，可将爬取得到的课程 JSON 写入数据库。但前端没有上传 JSON、没有教务入口、也没有触发该导入能力的页面。

## #3 后端已实现保护时段批量更新，但前端未实现

描述：后端已在 `backend/apps/protected_slots/views.py` 中实现 `batch_update`，前端 `frontend/js/api.js` 也封装了 `batchUpdateProtectedSlots`。但 `frontend/js/admin.js` 中“批量更新”按钮仍然只是提示，没有真实编辑器和提交逻辑。

## #4 后端已实现排课方案导出 Excel，但前端未实现

描述：后端已在 `backend/apps/scheduling/views.py` 中实现 `PlanViewSet.export()`，可以将排课方案导出为 `.xlsx` 文件。但前端方案列表目前只有“课表 / 评估 / 发布 / 删除”，没有“导出”按钮，`frontend/js/api.js` 里也没有导出方案的 API 方法。

## #5 后端已实现排课方案人工覆盖调整，但前端未实现

描述：后端已在 `backend/apps/scheduling/views.py` 中实现 `override`，支持对某门课的时间、教室、教师进行人工调整。但前端没有任何人工调整方案的按钮、表单或拖拽编辑入口，`frontend/js/api.js` 中也没有对应方法封装。

## #6 后端已实现排课任务进度查询，但前端未实现

描述：后端已在 `backend/apps/scheduling/views.py` 中实现任务状态查询，并在 `backend/apps/scheduling/urls.py` 中暴露 `GET /schedule/tasks/<uuid:pk>/`。前端 `frontend/js/api.js` 也封装了 `getScheduleTask`，但 `frontend/js/admin.js` 点击“生成新方案”后没有真实轮询任务状态，只是直接提示完成并刷新列表。

## #7 后端已实现冲突分析任务进度查询，但前端未实现

描述：后端已在 `backend/apps/conflict_analysis/views.py` 中实现任务状态查询，前端 `frontend/js/api.js` 也封装了 `getConflictTask`。但 `frontend/js/admin.js` 目前使用 `setTimeout` 模拟分析完成，没有真实轮询后端任务状态。

## #8 后端已实现查看某专业下的学生名单，但前端未实现

描述：后端已在 `backend/apps/courses/views.py` 中通过 `MajorViewSet.students` 提供某专业下学生列表接口，前端 `frontend/js/api.js` 也封装了 `getMajorStudents`。但当前前端没有对应页面或交互入口。

## #9 后端已实现学生端课程冲突详情接口，但前端未实现

描述：后端已在 `backend/apps/student/views.py` 中实现 `ConflictDetailView`，前端 `frontend/js/api.js` 也封装了 `getConflictDetail`。但学生端 `frontend/js/script.js` 目前使用本地位图自行计算冲突详情，并未真正调用后端冲突详情接口。

## #10 优先建议补齐的前端缺口

描述：

* Excel 导入课程
* 排课方案导出
* 排课任务进度轮询
* 冲突分析任务进度轮询
