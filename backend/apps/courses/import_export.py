import json
import re
from collections import OrderedDict

from django.db import transaction

from apps.courses.models import Classroom, Course, CourseScheduleItem, Major, Teacher

# ── 常量 ──────────────────────────────────────────────────

DAY_MAP = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}
CAMPUS_KEYWORDS = {"北校园", "东校园", "南校园", "珠海校区", "深圳校区"}
ACTIVITY_KEYWORDS = {"理论环节", "实验实践环节", "实验环节", "实践环节", "上机环节", "考试环节"}


# ── JSON 读取 ─────────────────────────────────────────────


def _load_json_data(file):
    """从上传文件或文件路径读取 JSON 数据，返回 records 列表。"""
    if hasattr(file, "read"):
        raw = file.read()
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        data = json.loads(raw)
    else:
        with open(str(file), "r", encoding="utf-8") as f:
            data = json.load(f)

    if isinstance(data, list):
        records = []
        for item in data:
            if isinstance(item, dict) and "rows" in item:
                records.extend(item["rows"])
            else:
                records.append(item)
        return records
    if isinstance(data, dict) and "rows" in data:
        return data["rows"]
    return data


# ── teachingTimePlaceStr 解析 ──────────────────────────────


def _parse_teaching_time_place_str(t_str):
    """
    格式（以 / 分割）：
      4 段: week/day/period/activity_type
      5 段: week/day/period/location/activity_type
      6 段: week/day/period/location/teacher/activity_type
    """
    items = []
    for segment in t_str.rstrip(",").split(","):
        segment = segment.strip()
        if not segment:
            continue
        parts = segment.split("/")
        if len(parts) < 4:
            continue

        week_part = parts[0].strip()
        day_part = parts[1].strip()
        period_part = parts[2].strip()

        if len(parts) >= 6:
            location = parts[3].strip()
            teacher_name = parts[4].strip()
            activity_type = parts[5].strip()
        elif len(parts) == 5:
            location = parts[3].strip()
            teacher_name = ""
            activity_type = parts[4].strip()
        else:
            location = ""
            teacher_name = ""
            activity_type = parts[3].strip()

        week_str = re.sub(r"[^0-9\-]", "", week_part).strip()
        if "-" in week_str:
            w_start, w_end = week_str.split("-", 1)
        else:
            w_start = w_end = week_str

        day_str = re.sub(r"^星期", "", day_part)
        day_of_week = DAY_MAP.get(day_str, 0)

        period_str = re.sub(r"[^0-9\-]", "", period_part)
        try:
            period = int(period_str.split("-")[0].strip())
        except ValueError:
            continue

        building, room_name = _parse_location(location)

        items.append(
            {
                "week_start": int(w_start),
                "week_end": int(w_end),
                "day_of_week": day_of_week,
                "period": period,
                "building": building,
                "classroom_name": room_name,
                "teacher_name": teacher_name,
                "activity_type": activity_type,
            }
        )
    return items


def _parse_location(location_str):
    if not location_str or location_str in ACTIVITY_KEYWORDS:
        return "", ""
    parts = location_str.split("-")
    if len(parts) <= 1:
        return location_str, location_str
    if len(parts) == 2:
        return parts[0], parts[1]
    campus = parts[0]
    building = "-".join(parts[1:-1])
    room = parts[-1]
    full_building = f"{campus}-{building}" if campus else building
    return full_building, room


# ── readObj 解析 ───────────────────────────────────────────


def _parse_read_obj(read_obj, department_default=""):
    groups = []
    for part in read_obj.split(","):
        part = part.strip()
        if not part:
            continue
        tokens = part.split()
        if tokens and tokens[0] in CAMPUS_KEYWORDS:
            tokens = tokens[1:]
        rest = " ".join(tokens)

        m = re.search(r"(\d{4}级)", rest)
        if not m:
            continue

        department = rest[: m.start()].strip() or department_default
        grade_info = rest[m.start() :]
        grade_tokens = re.split(r"\s+", grade_info.strip())

        grade = grade_tokens[0] if grade_tokens else ""
        major_name = ""
        class_name = ""

        for t in grade_tokens[1:]:
            cleaned = re.sub(r"^\d{2}级", "", t).strip()
            if not cleaned:
                continue
            if re.search(r"[\d一二三四五六七八九十]", cleaned):
                class_name = cleaned
            elif not major_name:
                major_name = cleaned

        if not major_name:
            major_name = department.split("（")[0]

        groups.append(
            {
                "department": department,
                "grade": grade,
                "major_name": major_name,
                "class_name": class_name,
            }
        )
    return groups


# ── 校区提取 ───────────────────────────────────────────────


def _extract_campus_from_record(record):
    return record.get("openingSchoolName", "").strip()


# ── 扫描提取实体 ───────────────────────────────────────────


def _extract_entities(records, semester_override=None, session_length=None):
    majors = OrderedDict()
    teachers = OrderedDict()
    classrooms = OrderedDict()
    courses = OrderedDict()
    all_schedule_items = []

    for record in records:
        semester = semester_override or record.get("yearTerm", "")
        course_id_source = str(record.get("courseId", ""))
        course_name = record.get("courseName", "").strip()
        course_code = record.get("courseNum", "").strip()
        try:
            credit = float(record.get("score", 0) or 0)
        except (ValueError, TypeError):
            credit = 0.0
        department = record.get("openingUnitName", "").strip()
        category = record.get("courseCategoryName", "").strip()
        try:
            limit = int(record.get("limitNumber")) if record.get("limitNumber") else None
        except (ValueError, TypeError):
            limit = None
        campus = _extract_campus_from_record(record)

        teacher_names = [t.strip() for t in record.get("teachingName", "").split(",") if t.strip()]

        is_professional = category in ("专必", "专选")

        read_obj = record.get("readObj", "")
        parsed_groups = _parse_read_obj(read_obj, department)

        for g in parsed_groups:
            major_key = (g["major_name"], department)
            if major_key not in majors:
                majors[major_key] = g["major_name"]

        for tn in teacher_names:
            if tn not in teachers:
                teachers[tn] = {"name": tn, "department": department}

        if course_id_source and course_id_source not in courses:
            major_name = parsed_groups[0]["major_name"] if parsed_groups else department.split("（")[0]
            courses[course_id_source] = {
                "name": course_name,
                "code": course_code,
                "credit": credit,
                "semester": semester,
                "campus": campus,
                "teacher_names": set(),
                "is_professional": is_professional,
                "expected_student_count": limit,
                "department": department,
                "major_name": major_name,
                "course_id_from_source": course_id_source,
                "session_length": session_length,
            }
        if course_id_source:
            courses[course_id_source]["teacher_names"].update(teacher_names)

        t_str = record.get("teachingTimePlaceStr", "")
        items = _parse_teaching_time_place_str(t_str)
        for item in items:
            item["course_id_source"] = course_id_source
            item["semester"] = semester
            item["department"] = department
            item["campus"] = campus

            ck = (item["building"], item["classroom_name"])
            if ck not in classrooms and item["building"]:
                classrooms[ck] = {
                    "building": item["building"],
                    "name": item["classroom_name"],
                    "is_lab": ("实验中心" in item["building"] or "实验室" in item["classroom_name"]),
                    "campus": item.get("campus", ""),
                }

            if item["teacher_name"] and item["teacher_name"] not in teachers:
                teachers[item["teacher_name"]] = {
                    "name": item["teacher_name"],
                    "department": department,
                }
                if course_id_source in courses:
                    courses[course_id_source]["teacher_names"].add(item["teacher_name"])

            all_schedule_items.append(item)

    return {
        "majors": majors,
        "teachers": teachers,
        "classrooms": classrooms,
        "courses": courses,
        "schedule_items": all_schedule_items,
        "course_count": len(courses),
        "teacher_count": len(teachers),
        "classroom_count": len(classrooms),
        "schedule_count": len(all_schedule_items),
    }


# ── 写入数据库 ─────────────────────────────────────────────


def _persist_entities(entities):
    major_objects = {}
    for name, department in entities["majors"]:
        obj, _ = Major.objects.get_or_create(name=name)
        major_objects[(name, department)] = obj

    teacher_objects = {}
    for name, data in entities["teachers"].items():
        obj, _ = Teacher.objects.get_or_create(name=name, defaults={"department": data["department"]})
        if data["department"] and not obj.department:
            obj.department = data["department"]
            obj.save(update_fields=["department"])
        teacher_objects[name] = obj

    classroom_objects = {}
    for (building, name), data in entities["classrooms"].items():
        obj, _ = Classroom.objects.get_or_create(
            building=data["building"], name=data["name"], defaults={"is_lab": data["is_lab"]}
        )
        classroom_objects[(building, name)] = obj

    course_objects = {}
    for cid, data in entities["courses"].items():
        major_key = (data["major_name"], data["department"])
        major = major_objects.get(major_key)
        defaults = {
            "name": data["name"],
            "code": data["code"],
            "credit": data["credit"],
            "semester": data["semester"],
            "campus": data["campus"],
            "major": major,
            "is_professional_course": data["is_professional"],
            "expected_student_count": data["expected_student_count"],
        }
        if data.get("session_length") is not None:
            defaults["session_length"] = data["session_length"]
        course, created = Course.objects.get_or_create(
            course_id_from_source=cid,
            defaults=defaults,
        )
        if not created and data.get("session_length") is not None:
            # 更新已存在课程的连排节数
            course.session_length = data["session_length"]
            course.save(update_fields=["session_length"])
        if created:
            for tn in data["teacher_names"]:
                teacher = teacher_objects.get(tn)
                if teacher:
                    course.teachers.add(teacher)
        course_objects[cid] = course

    created_items = 0
    for item in entities["schedule_items"]:
        course = course_objects.get(item["course_id_source"])
        if not course:
            continue
        teacher = teacher_objects.get(item["teacher_name"])
        ck = (item["building"], item["classroom_name"])
        classroom = classroom_objects.get(ck)

        CourseScheduleItem.objects.create(
            course=course,
            teacher=teacher,
            classroom=classroom,
            day_of_week=item["day_of_week"],
            period=item["period"],
            week_start=item["week_start"],
            week_end=item["week_end"],
        )
        created_items += 1

    return {
        "major_count": len(major_objects),
        "teacher_count": len(teacher_objects),
        "classroom_count": len(classroom_objects),
        "course_count": len(course_objects),
        "schedule_count": created_items,
    }


# ── 公开 API ──────────────────────────────────────────────


def import_courses_from_json(file, session_length=None):
    """从 JSON 文件导入课程数据（test_100.json 格式）。

    session_length: 默认连排节数，JSON 中所有课程统一设置为此值。
    """
    records = _load_json_data(file)
    entities = _extract_entities(records, session_length=session_length)

    with transaction.atomic():
        stats = _persist_entities(entities)

    return {
        "imported_count": stats["course_count"],
        "total_records": len(records),
        "majors": stats["major_count"],
        "teachers": stats["teacher_count"],
        "classrooms": stats["classroom_count"],
        "courses": stats["course_count"],
        "schedule_items": stats["schedule_count"],
        "errors": [],
    }
