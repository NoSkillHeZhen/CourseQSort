"""
排课优化器 — 调度入口。

从数据库加载数据，调用遗传算法生成排课方案。
染色体 = [CourseSchedule, ...]，其中 CourseSchedule 每门课固定周课表。
"""

import random

DEFAULT_TOTAL_WEEKS = 18


def run(plan, progress_callback=None):
    from apps.courses.models import Classroom, Course
    from apps.scheduling.models import ScheduleEntry

    major_ids = plan.major_ids or []
    config = plan.algorithm_config or {}

    if progress_callback:
        progress_callback(0.0, 0, 0.0)

    # ---- 加载课程（不按学期过滤，包含数据库中所有课程）----
    courses_qs = Course.objects.all().prefetch_related("schedule_items", "teachers")
    if major_ids:
        courses_qs = courses_qs.filter(major_id__in=major_ids)
    courses = list(courses_qs)

    if not courses:
        if progress_callback:
            progress_callback(1.0, 0, 0.0)
        return 0, 0.0, {"weeks": 0, "message": "no courses found"}

    total_weeks = int(config.get("total_weeks", 0)) or DEFAULT_TOTAL_WEEKS
    total_weeks = max(1, min(total_weeks, 30))

    classrooms = list(Classroom.objects.all())

    # ---- 清除旧条目 ----
    ScheduleEntry.objects.filter(plan=plan).delete()

    # ================================================================
    # 遗传算法优化（始终使用，保证每次方案有差异）
    # ================================================================
    if progress_callback:
        progress_callback(0.1, 0, 0.0)

    from .genetic import expand_chromosome, run_genetic

    random.seed()

    def ga_progress(progress, gen, fitness):
        if progress_callback:
            progress_callback(0.1 + 0.85 * progress, gen, fitness)

    # chromosome = [CourseSchedule, ...]
    best_chromosome, best_fitness, stats = run_genetic(courses, classrooms, [], config, ga_progress)

    if progress_callback:
        progress_callback(0.95, stats.get("generations", 0), best_fitness)

    # 展开染色体 → ScheduleEntry
    flat_genes = expand_chromosome(best_chromosome)

    entries = []
    for gene in flat_genes:
        course_id, week, day, start_p, sl, teacher_id, classroom_id = gene

        course = next((c for c in courses if c.id == course_id), None)
        if not course:
            continue

        teacher = None
        if teacher_id:
            for c in courses:
                t = c.teachers.filter(id=teacher_id).first()
                if t:
                    teacher = t
                    break

        classroom = None
        if classroom_id:
            classroom = next((cr for cr in classrooms if cr.id == classroom_id), None)

        for p in range(start_p, start_p + sl):
            entries.append(
                ScheduleEntry(
                    plan=plan,
                    course=course,
                    teacher=teacher,
                    classroom=classroom,
                    week=week,
                    day_of_week=day,
                    period=p,
                )
            )

    if entries:
        ScheduleEntry.objects.bulk_create(entries, ignore_conflicts=True)

    if progress_callback:
        progress_callback(1.0, stats.get("generations", 0), best_fitness)

    return (
        len(entries),
        best_fitness,
        {
            "generations": stats.get("generations", 0),
            "best_fitness": round(best_fitness, 4),
            "total_entries": len(entries),
            "weeks": total_weeks,
            "message": "genetic algorithm optimization",
        },
    )
