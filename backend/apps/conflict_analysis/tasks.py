"""
冲突分析异步任务模块。

分析流程：
1. 加载所有课程及其排课时段
2. 遍历所有课程对，找到时段重叠的课程对
3. 通过 CourseAssignment 匹配受影响的学生数
4. 保存冲突分析结果
"""

import traceback
from collections import defaultdict

from apps.conflict_analysis.models import ConflictPair, ConflictTaskRecord
from apps.courses.models import Course, CourseAssignment, Student


def run_analysis_sync(task_id):
    """同步执行冲突分析（由 view 在线程中调用）。"""
    try:
        task = ConflictTaskRecord.objects.get(task_id=task_id)
    except ConflictTaskRecord.DoesNotExist:
        return

    task.status = "RUNNING"
    task.progress = 0.0
    task.save(update_fields=["status", "progress"])

    try:
        result = task.result
        semester = result.semester
        threshold = result.threshold

        # 加载课程 + 排课时段
        courses = Course.objects.filter(semester=semester).prefetch_related("schedule_items", "assignments")
        course_list = list(courses)

        if not course_list:
            task.status = "SUCCESS"
            task.progress = 1.0
            task.total_pairs = 0
            task.conflict_pairs_found = 0
            task.save(update_fields=["status", "progress", "total_pairs", "conflict_pairs_found"])
            result.course_count = 0
            result.conflict_pairs_count = 0
            result.save(update_fields=["course_count", "conflict_pairs_count"])
            return

        total_pairs = len(course_list) * (len(course_list) - 1) // 2
        task.total_pairs = total_pairs
        task.save(update_fields=["total_pairs"])

        # 构建每门课的时段集合
        course_slots = {}
        for c in course_list:
            slots = set()
            for item in c.schedule_items.all():
                slots.add((item.day_of_week, item.period))
            course_slots[c.id] = slots

        # 构建每门课 → 受影响学生的查询条件
        # CourseAssignment 定义了 (major, grade, class_identification) → course
        course_assignments = defaultdict(list)
        for ca in CourseAssignment.objects.filter(course__semester=semester).select_related("major"):
            course_assignments[ca.course_id].append(
                {
                    "major_id": ca.major_id,
                    "grade": ca.grade or "",
                    "class_identification": ca.class_identification or "",
                }
            )

        # 预加载所有学生
        all_students = list(Student.objects.all().values("id", "major_id", "grade", "class_identification"))

        # 为每门课构建受影响学生 ID 集合（缓存）
        course_student_ids = {}

        def _get_student_ids(course_id):
            """获取某门课关联的所有学生 ID"""
            if course_id in course_student_ids:
                return course_student_ids[course_id]

            rules = course_assignments.get(course_id, [])
            if not rules:
                course_student_ids[course_id] = set()
                return set()

            ids = set()
            for s in all_students:
                for rule in rules:
                    match = True
                    if rule["major_id"] and s["major_id"] != rule["major_id"]:
                        match = False
                    if rule["grade"] and s["grade"] != rule["grade"]:
                        match = False
                    if rule["class_identification"] and s["class_identification"] != rule["class_identification"]:
                        match = False
                    if match:
                        ids.add(s["id"])
                        break
            course_student_ids[course_id] = ids
            return ids

        analyzed = 0
        conflict_pairs = []
        last_progress_save = 0

        for i in range(len(course_list)):
            for j in range(i + 1, len(course_list)):
                ca, cb = course_list[i], course_list[j]
                slots_a = course_slots.get(ca.id, set())
                slots_b = course_slots.get(cb.id, set())
                overlap = slots_a & slots_b

                analyzed += 1

                # 每 50 对保存一次进度
                if analyzed - last_progress_save >= 50:
                    task.analyzed_pairs = analyzed
                    task.progress = round(min(1.0, analyzed / max(total_pairs, 1)), 4)
                    task.save(update_fields=["analyzed_pairs", "progress"])
                    last_progress_save = analyzed

                if overlap:
                    # 计算真正受影响的学生数（两门课的受众交集）
                    students_a = _get_student_ids(ca.id)
                    students_b = _get_student_ids(cb.id)

                    if students_a and students_b:
                        conflict_count = len(students_a & students_b)
                    else:
                        # 没有分配规则时，用重叠时段数做估算
                        conflict_count = len(overlap)

                    total_students = len(students_a | students_b) or 1
                    rate = round(min(1.0, conflict_count / max(total_students, 1)), 4)

                    if conflict_count >= threshold:
                        conflict_pairs.append(
                            ConflictPair(
                                result=result,
                                course_a=ca,
                                course_b=cb,
                                conflicting_student_count=conflict_count,
                                conflict_rate=rate,
                            )
                        )

        # 批量写入冲突对
        if conflict_pairs:
            ConflictPair.objects.bulk_create(conflict_pairs, ignore_conflicts=True)

        result.course_count = len(course_list)
        result.conflict_pairs_count = len(conflict_pairs)
        result.save(update_fields=["course_count", "conflict_pairs_count"])

        task.status = "SUCCESS"
        task.progress = 1.0
        task.analyzed_pairs = analyzed
        task.conflict_pairs_found = len(conflict_pairs)
        task.save(update_fields=["status", "progress", "analyzed_pairs", "conflict_pairs_found"])

    except Exception as e:
        tb = traceback.format_exc()
        print("[CONFLICT ANALYSIS ERROR] task_id=" + task_id + "\n" + tb)
        task.status = "FAILED"
        task.error_message = str(e)
        task.save(update_fields=["status", "error_message"])
