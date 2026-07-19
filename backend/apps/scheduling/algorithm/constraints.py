"""
硬约束检查模块。

染色体基因: (course_id, week, day, start_period, session_length, teacher_id, classroom_id)
"""

from collections import defaultdict


def _get(obj, attr, default=None):
    if hasattr(obj, attr):
        return getattr(obj, attr, default)
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return default


def check_hard_constraints(chromosome, course_map, teacher_map, classroom_map):
    """
    返回违规列表 [(type, description_string), ...]
    """
    violations = []

    if not chromosome:
        return violations

    # 教师冲突: 同一教师同一周同一天同一节次
    teacher_slots = defaultdict(list)
    for gene in chromosome:
        _, week, day, start_p, sl, teacher_id, _ = gene
        if teacher_id:
            for p in range(start_p, start_p + sl):
                teacher_slots[(teacher_id, week, day, p)].append(gene)

    for key, genes in teacher_slots.items():
        if len(genes) > 1:
            tid, week, day, period = key
            t = teacher_map.get(tid)
            tname = t.name if t and hasattr(t, "name") else str(tid)
            violations.append(
                ("TEACHER_CONFLICT", f"教师「{tname}」第{week}周 周{day}第{period}节 同时上{len(genes)}门课")
            )

    # 教室冲突
    room_slots = defaultdict(list)
    for gene in chromosome:
        _, week, day, start_p, sl, _, classroom_id = gene
        if classroom_id:
            for p in range(start_p, start_p + sl):
                room_slots[(classroom_id, week, day, p)].append(gene)

    for key, genes in room_slots.items():
        if len(genes) > 1:
            rid, week, day, period = key
            violations.append(
                ("CLASSROOM_CONFLICT", f"教室#{rid} 第{week}周 周{day}第{period}节 被{len(genes)}门课占用")
            )

    return violations


def is_feasible(chromosome, course_map, teacher_map, classroom_map):
    violations = check_hard_constraints(chromosome, course_map, teacher_map, classroom_map)
    severe = [v for v in violations if v[0] in ("TEACHER_CONFLICT", "CLASSROOM_CONFLICT")]
    return len(severe) == 0
