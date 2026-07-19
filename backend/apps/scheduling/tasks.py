"""
排课异步任务模块。

负责：
1. 从数据库加载数据（课程、教室、教师、保护时段）
2. 调用遗传算法优化器生成排课方案
3. 更新任务状态和进度
"""

from apps.scheduling.algorithm import run as run_optimizer
from apps.scheduling.models import TaskRecord


def run_generate_sync(task_id):
    """
    同步执行排课生成（由 view 直接调用，不依赖 Celery）。

    流程：
    1. 获取任务和关联的方案
    2. 标记任务为 RUNNING
    3. 调用优化器
    4. 更新任务状态为 SUCCESS 或 FAILED
    """
    try:
        task = TaskRecord.objects.get(task_id=task_id)
    except TaskRecord.DoesNotExist:
        return

    task.status = "RUNNING"
    task.progress = 0.0
    task.save(update_fields=["status", "progress"])

    try:
        plan = task.plan
        if not plan:
            raise ValueError("任务没有关联排课方案")

        # 进度回调
        def on_progress(progress, generation, best_fitness):
            task.progress = float(progress)
            task.current_generation = generation
            task.best_fitness = float(best_fitness)
            task.estimated_time_remaining = ""
            task.save(update_fields=["progress", "current_generation", "best_fitness", "estimated_time_remaining"])

        # 执行优化算法
        entry_count, best_fitness, stats = run_optimizer(plan, on_progress)

        # 更新方案评分
        plan.overall_fitness = round(float(best_fitness), 4)
        plan.save(update_fields=["overall_fitness"])

        # 更新任务为成功
        task.status = "SUCCESS"
        task.progress = 1.0
        task.current_generation = stats.get("generations", stats.get("total_entries", 0))
        task.best_fitness = round(float(best_fitness), 4)
        task.estimated_time_remaining = ""
        task.save(
            update_fields=["status", "progress", "current_generation", "best_fitness", "estimated_time_remaining"]
        )

    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        print("[SCHEDULING ERROR] task_id=" + task_id + "\n" + tb)
        task.status = "FAILED"
        task.error_message = str(e) + "\n---\n" + tb.split("\n")[-3]
        task.save(update_fields=["status", "error_message"])
