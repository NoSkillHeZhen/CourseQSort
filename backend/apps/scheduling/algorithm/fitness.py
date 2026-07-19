"""
适应度函数。

染色体基因: (course_id, week, day, start_period, session_length, teacher_id, classroom_id)
"""

import math
from collections import defaultdict


def _get(obj, attr, default=None):
    if hasattr(obj, attr):
        return getattr(obj, attr, default)
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return default


def evaluate_fitness(chromosome, course_map, students, protected_slots, config):
    """
    计算适应度 0~1，越大越好。

    权重来自 config:
        variance_weight — 日课时均衡权重
        conflict_penalty_weight — 冲突惩罚/保护时段权重
    """
    if not chromosome:
        return 0.0, {}

    variance_weight = float(_get(config, "variance_weight", 0.6) or 0.6)
    conflict_weight = float(_get(config, "conflict_penalty_weight", 0.4) or 0.4)
    later_weight = float(_get(config, "later_period_weight", 0.0) or 0.0)

    total_w = variance_weight + conflict_weight + later_weight
    if total_w == 0:
        total_w = 1.0
    variance_weight /= total_w
    conflict_weight /= total_w
    later_weight /= total_w

    # 1. 按课程统计每天的课时分布（跨所有周取平均）
    # course_daily[course_id][day] = period_count
    course_daily = defaultdict(lambda: defaultdict(int))
    course_week_count = defaultdict(int)  # 每门课的活跃周数

    for gene in chromosome:
        cid, week, day, start_p, sl, _, _ = gene
        course_daily[cid][day] += sl
        course_week_count[cid] = max(course_week_count[cid], week)

    # 日课时方差评分
    variance_scores = []
    for cid, day_hours in course_daily.items():
        days = list(range(1, 6))
        values = [day_hours.get(d, 0) for d in days]
        total = sum(values)
        if total == 0:
            variance_scores.append(0.5)
            continue
        avg = total / 5.0
        var = sum((v - avg) ** 2 for v in values) / 5.0
        # 归一化：方差/均值²，映射到指数衰减
        cv2 = var / max(avg**2, 1)
        variance_scores.append(math.exp(-cv2 * 3))

    avg_variance = sum(variance_scores) / max(len(variance_scores), 1)

    # 2. 保护时段惩罚
    protected_occupied = 0
    if protected_slots:
        for gene in chromosome:
            _, week, day, start_p, sl, _, _ = gene
            for p in range(start_p, start_p + sl):
                for ps in protected_slots:
                    ps_day = ps.day_of_week if hasattr(ps, "day_of_week") else ps.get("day_of_week", 0)
                    ps_start = ps.start_period if hasattr(ps, "start_period") else ps.get("start_period", 0)
                    ps_end = ps.end_period if hasattr(ps, "end_period") else ps.get("end_period", 0)
                    if ps_day == day and ps_start <= p <= ps_end:
                        protected_occupied += 1
                        break

    penalty_base = float(_get(config, "protected_slot_penalty", 8.0) or 8.0)
    max_possible = max(len(chromosome), 1)
    penalty_ratio = protected_occupied / max_possible
    penalty_score = math.exp(-penalty_ratio * penalty_base / 2)

    # 3. 课程周覆盖度
    total_weeks_cfg = int(_get(config, "total_weeks", 18) or 18)
    dispersion_list = []
    for cid, max_w in course_week_count.items():
        course = course_map.get(cid)
        total_hours = course.hours if course and course.hours else 48
        course_sl = int(getattr(course, "session_length", 2) or 2)
        expected_weeks = min(total_weeks_cfg, max(1, math.ceil(total_hours / course_sl)))
        dispersion_list.append(min(1.0, max_w / max(expected_weeks, 1)))
    avg_dispersion = sum(dispersion_list) / max(len(dispersion_list), 1) if dispersion_list else 0.5

    # 4. 排课后置评分（起始节次越靠后分数越高，0~1）
    period_count = int(_get(config, "timetable_periods", 0)) or 11
    later_scores = []
    for gene in chromosome:
        _, week, day, start_p, sl, _, _ = gene
        later_scores.append((start_p - 1) / max(period_count - 1, 1))
    avg_later = sum(later_scores) / max(len(later_scores), 1) if later_scores else 0.5

    # 综合
    fitness = (
        variance_weight * avg_variance
        + conflict_weight * (0.5 * penalty_score + 0.5 * avg_dispersion)
        + later_weight * avg_later
    )
    fitness = max(0.0, min(1.0, fitness))

    return fitness, {
        "variance_score": round(avg_variance, 4),
        "penalty_score": round(penalty_score, 4),
        "dispersion": round(avg_dispersion, 4),
        "protected_occupied": protected_occupied,
        "later_score": round(avg_later, 4),
        "overall": round(fitness, 4),
    }
