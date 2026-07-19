"""
遗传算法核心。

染色体 = 每门课一个 CourseSchedule:
    { course_id, start_week, active_weeks, extra_weeks,
      base_blocks: [(day, start_p, sl), ...],   ← 每周固定不变
      extra_block: (day, start_p, sl) or None,   ← 前 extra_weeks 周额外
      teacher_id, classroom_id }

扩展开后变为平铺基因列表用于适应度评估:
    (course_id, week, day, start_p, sl, teacher_id, classroom_id)
"""

import math
import random
from collections import defaultdict


def _get(obj, attr, default=None):
    if hasattr(obj, attr):
        return getattr(obj, attr, default)
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return default


# ================================================================
# 染色体扩展：CourseSchedule → 平铺基因列表
# ================================================================


def expand_chromosome(chromosome):
    """将紧凑的 CourseSchedule 列表展开为键值评估用的扁平基因列表"""
    genes = []
    for cs in chromosome:
        cid = cs["course_id"]
        sw = cs["start_week"]
        aw = cs["active_weeks"]
        ew = cs["extra_weeks"]
        tid = cs["teacher_id"]
        rid = cs["classroom_id"]

        for w in range(sw, sw + aw):
            for day, sp, sl in cs["base_blocks"]:
                genes.append((cid, w, day, sp, sl, tid, rid))
            if cs["extra_block"] and (w - sw) < ew:
                d, sp, sl = cs["extra_block"]
                genes.append((cid, w, d, sp, sl, tid, rid))

    return genes


# ================================================================
# 期间分界与有效连排块
# ================================================================


def _build_break_after(config):
    """从配置构建 break_after 集合（哪些节次后不可跨越）。

    两来源：
    1. 节次间时间间隔 >= 90 分钟（吃饭等自然休息）
    2. 用户自定义的时间段边界（period_groups），当 allow_cross_period=False 时生效
    """
    break_after = set()
    period_times = _get(config, "period_times", []) or []
    period_count = int(_get(config, "timetable_periods", 0)) or len(period_times) or 11

    # 1. 时间间隔 >= 90 分钟的边界
    for i in range(len(period_times) - 1):
        try:
            end_h, end_m = map(int, period_times[i]["end"].split(":"))
            start_h, start_m = map(int, period_times[i + 1]["start"].split(":"))
            if (start_h * 60 + start_m) - (end_h * 60 + end_m) >= 90:
                break_after.add(i + 1)
        except (KeyError, ValueError):
            pass

    # 2. 用户自定义时间段边界（不允许跨段时添加）
    allow_cross = config.get("allow_cross_period", False) if isinstance(config, dict) else False
    period_groups = _get(config, "period_groups", None) or None
    if not allow_cross and period_groups:
        for group in period_groups:
            if isinstance(group, list) and len(group) == 2:
                end_p = group[1]
                if end_p < period_count:
                    break_after.add(end_p)

    return break_after


def _build_session_groups(period_count, break_after):
    """对所有 session_length (1~6) 预构建每天的有效连排块"""
    days = [1, 2, 3, 4, 5]
    groups = {}
    for sl in range(1, 7):
        g = {d: [] for d in days}
        for d in days:
            p = 1
            while p <= period_count:
                end = p + sl - 1
                if end > period_count:
                    break
                crosses = any(p <= bp < end for bp in break_after)
                if not crosses:
                    g[d].append((p, end))
                p += 1
            if not g[d]:
                for p in range(1, period_count + 1):
                    end = min(p + sl - 1, period_count)
                    g[d].append((p, end))
        groups[sl] = g
    return groups


def _filter_aligned_blocks(day_groups, session_length, period_groups):
    """根据连排对齐规则过滤有效块。

    规则：
    - 2节连排：只能从奇数节开始（第1、3、5、7、9…节）
    - 4节连排：只能从≥4节的时间段的第一节课开始
    - 返回过滤后的列表；若过滤后为空则返回原列表（优雅降级）
    """
    if not day_groups:
        return day_groups

    if session_length == 2:
        filtered = [(sp, ep) for sp, ep in day_groups if sp % 2 == 1]
        return filtered if filtered else day_groups

    if session_length == 4 and period_groups:
        valid_starts = set(
            g[0] for g in period_groups if isinstance(g, (list, tuple)) and len(g) == 2 and g[1] - g[0] + 1 >= 4
        )
        if valid_starts:
            filtered = [(sp, ep) for sp, ep in day_groups if sp in valid_starts]
            return filtered if filtered else day_groups

    return day_groups


# ================================================================
# 种群初始化
# ================================================================


def _make_course_schedule(
    course,
    all_groups,
    classrooms_by_type,
    teacher_pool,
    total_weeks,
    default_sl,
    align_sessions=False,
    period_groups=None,
    prefer_later=False,
):
    """为一门课生成一个 CourseSchedule"""
    cid = course.id
    total_hours = course.hours or 48
    course_sl = int(getattr(course, "session_length", 0) or 0)
    if not (1 <= course_sl <= 6):
        course_sl = default_sl

    groups = all_groups[course_sl]

    # 计算会话分配
    total_sessions = max(1, math.ceil(total_hours / course_sl))

    if total_sessions <= total_weeks:
        base_per_week = 1
        extra_weeks = 0
        active_weeks = total_sessions
    else:
        base_per_week = total_sessions // total_weeks
        extra_weeks = total_sessions % total_weeks
        active_weeks = total_weeks

    start_week = random.randint(1, max(1, total_weeks - active_weeks + 1))

    def _pick_block(day):
        """挑选一个满足对齐规则的排课块（后置模式下偏向靠后的时段）"""
        dg = list(groups.get(day, []))
        if align_sessions and dg:
            dg = _filter_aligned_blocks(dg, course_sl, period_groups)
        if dg:
            if prefer_later:
                # 加权随机：起始节次越靠后权重越高
                weights = [sp for sp, _ in dg]
                sp, ep = random.choices(dg, weights=weights, k=1)[0]
            else:
                sp, ep = random.choice(dg)
            return day, sp
        return day, 1

    # 分配 base_blocks（每周固定不变）
    base_blocks = []
    for _ in range(base_per_week):
        day = random.choice([1, 2, 3, 4, 5])
        d, sp = _pick_block(day)
        base_blocks.append((d, sp, course_sl))

    # 分配 extra_block（只在 extra_weeks 周出现）
    extra_block = None
    if extra_weeks > 0:
        day = random.choice([1, 2, 3, 4, 5])
        d, sp = _pick_block(day)
        extra_block = (d, sp, course_sl)

    # 教师
    teacher_id = random.choice(teacher_pool).id if teacher_pool else None

    # 教室
    req_types = tuple(sorted(course.required_classroom_types)) if course.required_classroom_types else None
    pool = classrooms_by_type.get(req_types, [])
    if not pool:
        pool = [r for rooms in classrooms_by_type.values() for r in rooms]
    classroom_id = random.choice(pool).id if pool else None

    return {
        "course_id": cid,
        "start_week": start_week,
        "active_weeks": active_weeks,
        "extra_weeks": extra_weeks,
        "base_blocks": base_blocks,
        "extra_block": extra_block,
        "teacher_id": teacher_id,
        "classroom_id": classroom_id,
    }


def init_population(courses, classrooms, teachers, config):
    pop_size = min(int(_get(config, "population_size", 200) or 200), 300)
    total_weeks = int(_get(config, "total_weeks", 18) or 18)
    period_count = int(_get(config, "timetable_periods", 0)) or 11
    default_sl = int(_get(config, "session_length", 2) or 2)
    align_sessions = bool(_get(config, "align_sessions", True))
    period_groups = _get(config, "period_groups", None) or None
    prefer_later = float(_get(config, "later_period_weight", 0.0) or 0.0) > 0

    # 分界检测（时间间隔 + 用户自定义时间段）
    break_after = _build_break_after(config)

    all_groups = _build_session_groups(period_count, break_after)

    # 教室分类
    classrooms_by_type = defaultdict(list)
    for room in classrooms:
        equip = tuple(sorted(room.equipment_types)) if room.equipment_types else ("default",)
        classrooms_by_type[equip].append(room)

    teacher_pool = list(teachers)
    courses_list = list(courses)

    population = []
    for _ in range(pop_size):
        chromosome = []
        for course in courses_list:
            cs = _make_course_schedule(
                course,
                all_groups,
                classrooms_by_type,
                teacher_pool,
                total_weeks,
                default_sl,
                align_sessions,
                period_groups,
                prefer_later,
            )
            chromosome.append(cs)
        population.append(chromosome)

    return population


# ================================================================
# 适应度评估
# ================================================================


def evaluate_population(population, course_list, teacher_list, classroom_list, protected_slots, config):
    from .constraints import check_hard_constraints
    from .fitness import evaluate_fitness

    course_map = {c.id: c for c in course_list}
    teacher_map = {t.id: t for t in teacher_list}
    classroom_map = {cr.id: cr for cr in classroom_list}

    scores = []
    for chromosome in population:
        try:
            flat = expand_chromosome(chromosome)
            fitness, details = evaluate_fitness(flat, course_map, [], protected_slots, config)
            violations = check_hard_constraints(flat, course_map, teacher_map, classroom_map)
            if violations:
                severe = sum(1 for v in violations if v[0] in ("TEACHER_CONFLICT", "CLASSROOM_CONFLICT"))
                penalty = min(0.9, severe * 0.3 + (len(violations) - severe) * 0.05)
                fitness = max(0.01, fitness - penalty)
            scores.append((fitness, details))
        except Exception:
            scores.append((0.0, {}))
    return scores


# ================================================================
# 选择 / 交叉 / 变异
# ================================================================


def tournament_select(population, scores, tournament_size=3):
    indices = list(range(len(population)))
    candidates = random.sample(indices, min(tournament_size, len(population)))
    return [cs.copy() for cs in population[max(candidates, key=lambda i: scores[i][0])]]


def crossover(parent1, parent2):
    """按课程交换整个 CourseSchedule"""
    child1, child2 = [], []
    for i in range(len(parent1)):
        if random.random() < 0.5:
            child1.append(parent1[i].copy())
            child2.append(parent2[i].copy() if i < len(parent2) else parent1[i].copy())
        else:
            child1.append(parent2[i].copy() if i < len(parent2) else parent1[i].copy())
            child2.append(parent1[i].copy())
    return child1, child2


def mutate(chromosome, course_list, teacher_list, classrooms, config, mutation_rate=0.05):
    total_weeks = int(_get(config, "total_weeks", 18) or 18)
    period_count = int(_get(config, "timetable_periods", 0)) or 11
    default_sl = int(_get(config, "session_length", 2) or 2)
    align_sessions = bool(_get(config, "align_sessions", True))
    period_groups = _get(config, "period_groups", None) or None
    prefer_later = float(_get(config, "later_period_weight", 0.0) or 0.0) > 0
    course_map = {c.id: c for c in course_list}
    teacher_pool = list(teacher_list)

    break_after = _build_break_after(config)
    all_groups = _build_session_groups(period_count, break_after)

    classrooms_by_type = defaultdict(list)
    for room in classrooms:
        equip = tuple(sorted(room.equipment_types)) if room.equipment_types else ("default",)
        classrooms_by_type[equip].append(room)

    def _pick_block(day, course_sl):
        """挑选一个满足对齐规则的排课块（后置模式下偏向靠后的时段）"""
        dg = list(all_groups[course_sl].get(day, []))
        if align_sessions and dg:
            dg = _filter_aligned_blocks(dg, course_sl, period_groups)
        if dg:
            if prefer_later:
                weights = [sp for sp, _ in dg]
                sp, _ = random.choices(dg, weights=weights, k=1)[0]
            else:
                sp, _ = random.choice(dg)
            return sp
        return 1

    mutated = []
    for cs in chromosome:
        cs = cs.copy()
        course = course_map.get(cs["course_id"])
        course_sl = int(getattr(course, "session_length", 0) or 0) if course else default_sl
        if not (1 <= course_sl <= 6):
            course_sl = default_sl

        if random.random() < mutation_rate:
            # 变异起始周
            total_hours = (course.hours or 48) if course else 48
            total_sessions = max(1, math.ceil(total_hours / course_sl))
            if total_sessions <= total_weeks:
                aw = total_sessions
            else:
                aw = total_weeks
            cs["start_week"] = random.randint(1, max(1, total_weeks - aw + 1))
            cs["active_weeks"] = aw

        if random.random() < mutation_rate and cs["base_blocks"]:
            # 变异一个 base_block（遵守对齐规则）
            idx = random.randint(0, len(cs["base_blocks"]) - 1)
            day = random.choice([1, 2, 3, 4, 5])
            sp = _pick_block(day, course_sl)
            cs["base_blocks"][idx] = (day, sp, course_sl)

        if random.random() < mutation_rate and cs["extra_block"]:
            # 变异 extra_block（遵守对齐规则）
            day = random.choice([1, 2, 3, 4, 5])
            sp = _pick_block(day, course_sl)
            cs["extra_block"] = (day, sp, course_sl)

        if random.random() < mutation_rate and teacher_pool:
            cs["teacher_id"] = random.choice(teacher_pool).id

        if random.random() < mutation_rate and course:
            req_types = tuple(sorted(course.required_classroom_types)) if course.required_classroom_types else None
            pool = classrooms_by_type.get(req_types, [])
            if not pool:
                pool = [r for rooms in classrooms_by_type.values() for r in rooms]
            if pool:
                cs["classroom_id"] = random.choice(pool).id

        mutated.append(cs)
    return mutated


# ================================================================
# 进化循环
# ================================================================


def run_genetic(courses, classrooms, protected_slots, config, progress_callback=None):
    pop_size = min(int(_get(config, "population_size", 200) or 200), 300)
    max_gen = int(_get(config, "max_generations", 500) or 500)
    mutation_rate = float(_get(config, "mutation_rate", 0.05) or 0.05)
    crossover_rate = float(_get(config, "crossover_rate", 0.85) or 0.85)

    course_list = list(courses)
    classroom_list = list(classrooms)

    teacher_set = {}
    for c in course_list:
        for t in c.teachers.all():
            if t.id not in teacher_set:
                teacher_set[t.id] = t
    teacher_list = list(teacher_set.values())

    if not course_list:
        return [], 0.0, {"generations": 0, "message": "no courses"}

    population = init_population(course_list, classroom_list, teacher_list, config)

    best_chromosome = None
    best_fitness = 0.0
    no_improve = 0

    for gen in range(max_gen):
        scores = evaluate_population(population, course_list, teacher_list, classroom_list, protected_slots, config)

        gen_best = max(s[0] for s in scores)

        if gen_best > best_fitness:
            best_fitness = gen_best
            best_idx = max(range(len(scores)), key=lambda i: scores[i][0])
            best_chromosome = [cs.copy() for cs in population[best_idx]]
            no_improve = 0
        else:
            no_improve += 1

        if progress_callback:
            progress_callback((gen + 1) / max_gen, gen + 1, best_fitness)

        # 精英保留
        elite_count = max(2, pop_size // 20)
        sorted_indices = sorted(range(len(scores)), key=lambda i: scores[i][0], reverse=True)
        new_population = [[cs.copy() for cs in population[i]] for i in sorted_indices[:elite_count]]

        # 生成下一代
        while len(new_population) < pop_size:
            p1 = tournament_select(population, scores)
            p2 = tournament_select(population, scores)
            if random.random() < crossover_rate:
                c1, c2 = crossover(p1, p2)
            else:
                c1, c2 = p1, p2
            c1 = mutate(c1, course_list, teacher_list, classroom_list, config, mutation_rate)
            c2 = mutate(c2, course_list, teacher_list, classroom_list, config, mutation_rate)
            new_population.append(c1)
            if len(new_population) < pop_size:
                new_population.append(c2)

        population = new_population

        if no_improve >= 50:
            break
        if best_fitness >= 0.999:
            break

    if best_chromosome is None:
        best_chromosome = [cs.copy() for cs in population[0]]

    return (
        best_chromosome,
        best_fitness,
        {
            "generations": gen + 1,
            "best_fitness": round(best_fitness, 4),
        },
    )
