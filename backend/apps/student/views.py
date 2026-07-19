import time
from collections import defaultdict

from django.db import IntegrityError, OperationalError, transaction
from django.db.models import F, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStudentUser
from apps.courses.models import Course, CourseAssignment, Student
from apps.student.bitmap import build_bitmap, has_conflict
from apps.student.models import Enrollment
from apps.student.recommendation import recommend_courses

SELECT_RETRY_COUNT = 3
SELECT_RETRY_DELAY_SECONDS = 0.05


def _is_course_required_for_user(course, user):
    """检查课程对某用户是否必修（基于 CourseAssignment 规则）"""
    try:
        student = Student.objects.get(user=user)
    except Student.DoesNotExist:
        return False

    # 构建查询条件：匹配专业 + 年级 + 班级
    q = Q(course=course)
    # 专业匹配（允许 null 表示不限专业，但必须有匹配规则）
    q &= Q(major=student.major) | Q(major__isnull=True)
    # 年级匹配
    q &= Q(grade=student.grade) | Q(grade="")
    # 班级匹配
    q &= Q(class_identification=student.class_identification) | Q(class_identification="")

    return CourseAssignment.objects.filter(q).exists()


def _build_segments(items, default_teacher=""):
    """
    将 CourseScheduleItem 列表合并为 segments。
    逐周对比课表快照，只按时间段（星期+节次）判断是否相同，
    相同时间段的连续周合并为一个 segment（忽略教室、教师的差异）。
    """
    if not items:
        return [], ""

    # 第一步：逐周建立完整快照（含教室/教师，用于最终展示）
    week_full = defaultdict(set)

    for item in items:
        ws = item.week_start or 1
        we = item.week_end or 18
        cr = item.classroom.name if item.classroom else ""
        t = item.teacher.name if item.teacher else default_teacher

        for w in range(ws, we + 1):
            week_full[w].add((item.day_of_week, item.period, cr, t))

    if not week_full:
        return [], ""

    # 第二步：只按"星期几"做比较 key，忽略节次/教室/教师差异
    week_key = {}
    for w, s in week_full.items():
        week_key[w] = tuple(sorted(set(dow for dow, _period, _cr, _t in s)))

    sorted_weeks = sorted(week_key.keys())

    # 第三步：合并连续且时间段相同的周
    segments = []
    seg_start = sorted_weeks[0]
    prev_key = week_key[seg_start]
    prev_full = week_full[seg_start]

    for i in range(1, len(sorted_weeks)):
        w = sorted_weeks[i]
        if w == sorted_weeks[i - 1] + 1 and week_key[w] == prev_key:
            continue
        _finish_segment(segments, seg_start, sorted_weeks[i - 1], prev_full)
        seg_start = w
        prev_key = week_key[w]
        prev_full = week_full[w]

    _finish_segment(segments, seg_start, sorted_weeks[-1], prev_full)

    first_cls = segments[0]["classroom"] if segments else ""
    return segments, first_cls


def _finish_segment(segments, ws, we, slot_data):
    """将一组 (dow, period, classroom, teacher) 转为 segment。
    slot_data 是 set。
    """
    time_slots = []
    classroom = ""
    teacher = ""
    for dow, period, cr, t in sorted(slot_data):
        time_slots.append({"day_of_week": dow, "period": period})
        if cr and not classroom:
            classroom = cr
        if t and not teacher:
            teacher = t

    segments.append(
        {
            "week_start": ws,
            "week_end": we,
            "time_slots": time_slots,
            "classroom": classroom,
            "teacher": teacher,
        }
    )


class ScheduleView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request):
        enrollments = Enrollment.objects.filter(user=request.user).select_related("course")

        slots = set()
        courses_data = []
        for enrollment in enrollments:
            course = enrollment.course
            items = course.schedule_items.all()
            time_slots = [(item.day_of_week, item.period) for item in items]
            slots.update(time_slots)

            teacher_name = ""
            first_teacher = course.teachers.first()
            if first_teacher:
                teacher_name = first_teacher.name

            # 使用逐周对比合并算法构建 segments
            segments, classroom_name = _build_segments(items, teacher_name)

            is_mandatory = _is_course_required_for_user(course, request.user)
            courses_data.append(
                {
                    "course_id": course.id,
                    "name": course.name,
                    "credit": course.credit,
                    "teacher": teacher_name,
                    "time_slots": [{"day_of_week": day, "period": period} for day, period in time_slots],
                    "classroom": classroom_name,
                    "mandatory": is_mandatory,
                    "segments": segments,
                }
            )

        return Response(
            {
                "student_id": request.user.id,
                "semester": enrollments.first().course.semester if enrollments else "",
                "bitmap": build_bitmap(list(slots)),
                "courses": courses_data,
            }
        )


class CourseListView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request):
        major_id = request.query_params.get("major")
        keyword = request.query_params.get("keyword")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        user_slots = set()
        for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
            for item in enrollment.course.schedule_items.all():
                user_slots.add((item.day_of_week, item.period))
        user_bitmap = build_bitmap(list(user_slots))

        courses = Course.objects.all().prefetch_related("schedule_items__classroom", "teachers")
        if major_id:
            courses = courses.filter(major_id=major_id)
        if keyword:
            courses = courses.filter(name__icontains=keyword)

        # 分页
        total_count = courses.count()
        start = (page - 1) * page_size
        courses = courses[start : start + page_size]

        results = []
        for c in courses:
            items = c.schedule_items.all()
            time_slots_raw = list(set((item.day_of_week, item.period) for item in items))
            course_bitmap = build_bitmap(time_slots_raw)
            conflict = has_conflict(user_bitmap, course_bitmap)

            conflict_with = []
            if conflict:
                for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
                    enrollment_slots = set(
                        (item.day_of_week, item.period) for item in enrollment.course.schedule_items.all()
                    )
                    overlap = enrollment_slots & set(time_slots_raw)
                    if overlap:
                        conflict_with.append(
                            {
                                "course_id": enrollment.course.id,
                                "name": enrollment.course.name,
                                "time_slots": [{"day_of_week": day, "period": period} for day, period in overlap],
                            }
                        )

            teacher_name = ""
            first_teacher = c.teachers.first()
            if first_teacher:
                teacher_name = first_teacher.name

            # 使用逐周对比合并算法构建 segments
            segments, classroom_name = _build_segments(items, teacher_name)

            enrolled_count = c.enrollments.count()
            capacity = c.expected_student_count or 9999

            is_mandatory = _is_course_required_for_user(c, request.user)
            results.append(
                {
                    "course_id": course.id,
                    "name": course.name,
                    "credit": course.credit,
                    "teacher": teacher_name,
                    "capacity": capacity,
                    "enrolled_count": enrolled_count,
                    "time_slots": [{"day_of_week": d, "period": p} for d, p in time_slots_raw],
                    "classroom": classroom_name,
                    "segments": segments,
                    "remaining_capacity": capacity - enrolled_count,
                    "conflict": conflict,
                    "conflict_with": conflict_with,
                    "mandatory": is_mandatory,
                }
            )

        return Response({"count": total_count, "results": results})


class ConflictDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request, pk=None):
        try:
            course = Course.objects.prefetch_related("schedule_items__classroom", "teachers").get(id=pk)
        except Course.DoesNotExist:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

        course_slots_raw = list({(item.day_of_week, item.period) for item in course.schedule_items.all()})
        course_bitmap = build_bitmap(course_slots_raw)

        conflict_courses = []
        conflict_slots = set()
        for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
            enrollment_slots = set((item.day_of_week, item.period) for item in enrollment.course.schedule_items.all())
            overlap = enrollment_slots & set(course_slots_raw)
            if overlap:
                for day, period in overlap:
                    conflict_slots.add((day, period))
                    first_item = enrollment.course.schedule_items.filter(day_of_week=day, period=period).first()
                    classroom_name = first_item.classroom.name if first_item and first_item.classroom else ""
                    teacher_name = ""
                    first_teacher = enrollment.course.teachers.first()
                    if first_teacher:
                        teacher_name = first_teacher.name
                    conflict_courses.append(
                        {
                            "course_id": enrollment.course.id,
                            "name": enrollment.course.name,
                            "teacher": teacher_name,
                            "day_of_week": day,
                            "period": period,
                            "classroom": classroom_name,
                            "conflict_type": "TIME_OVERLAP",
                        }
                    )

        return Response(
            {
                "course_id": course.id,
                "course_name": course.name,
                "course_time_slots": [{"day_of_week": day, "period": period} for day, period in course_slots_raw],
                "conflict_courses": conflict_courses,
                "bitmap": course_bitmap,
                "conflict_bitmap": build_bitmap(list(conflict_slots)),
            }
        )


class SelectCourseView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def post(self, request, pk=None):
        for attempt in range(SELECT_RETRY_COUNT):
            try:
                with transaction.atomic():
                    locked_rows = Course.objects.filter(id=pk).update(
                        expected_student_count=F("expected_student_count")
                    )
                    if not locked_rows:
                        return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

                    course = Course.objects.prefetch_related("schedule_items").get(id=pk)

                    if Enrollment.objects.filter(user=request.user, course=course).exists():
                        return Response(
                            {
                                "course_id": course.id,
                                "status": "ALREADY_SELECTED",
                                "message": "已选择该课程",
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    capacity = course.expected_student_count or 9999
                    enrolled_count = Enrollment.objects.filter(course=course).count()
                    if enrolled_count >= capacity:
                        return Response(
                            {
                                "course_id": course.id,
                                "status": "FULL",
                                "message": f"该课程容量已满（{capacity}/{capacity}）",
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    current_enrollments = list(Enrollment.objects.filter(user=request.user).select_related("course"))
                    user_slots = set()
                    for enrollment in current_enrollments:
                        for item in enrollment.course.schedule_items.all():
                            user_slots.add((item.day_of_week, item.period))

                    course_slots = set((item.day_of_week, item.period) for item in course.schedule_items.all())
                    if user_slots & course_slots:
                        conflict_names = []
                        for enrollment in current_enrollments:
                            enrollment_slots = set(
                                (item.day_of_week, item.period) for item in enrollment.course.schedule_items.all()
                            )
                            if enrollment_slots & course_slots:
                                conflict_names.append(enrollment.course.name)
                        return Response(
                            {
                                "course_id": course.id,
                                "status": "CONFLICT",
                                "message": f'课程时间与已选课程「{"、".join(conflict_names)}」冲突',
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    Enrollment.objects.create(user=request.user, course=course)
                    return Response(
                        {
                            "course_id": course.id,
                            "status": "SELECTED",
                            "message": "选课成功",
                        },
                        status=status.HTTP_201_CREATED,
                    )
            except IntegrityError:
                return Response(
                    {
                        "course_id": pk,
                        "status": "ALREADY_SELECTED",
                        "message": "已选择该课程",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            except OperationalError as exc:
                if "locked" in str(exc).lower() and attempt < SELECT_RETRY_COUNT - 1:
                    time.sleep(SELECT_RETRY_DELAY_SECONDS)
                    continue
                raise

        return Response(
            {
                "course_id": pk,
                "status": "RETRY_LATER",
                "message": "当前选课请求过于频繁，请稍后重试",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class DropCourseView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def delete(self, request, pk=None):
        try:
            course = Course.objects.get(id=pk)
        except Course.DoesNotExist:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

        # 检查是否为必修课
        if _is_course_required_for_user(course, request.user):
            return Response(
                {
                    "course_id": course.id,
                    "status": "REQUIRED",
                    "message": "必修课不可退",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        deleted, _ = Enrollment.objects.filter(user=request.user, course=course).delete()
        if not deleted:
            return Response(
                {
                    "course_id": course.id,
                    "status": "NOT_SELECTED",
                    "message": "Course not selected",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "course_id": course.id,
                "status": "DROPPED",
                "message": "Dropped",
            }
        )


class FreeSlotsView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request):
        user_slots = set()
        for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
            for item in enrollment.course.schedule_items.all():
                user_slots.add((item.day_of_week, item.period))

        period_labels = {
            1: "Periods 1-2",
            2: "Periods 3-4",
            3: "Periods 5-6",
            4: "Periods 7-8",
            5: "Periods 9-10",
            6: "Periods 11-12",
            7: "Periods 13-14",
            8: "Periods 15-16",
            9: "Periods 17-18",
            10: "Periods 19-20",
            11: "Periods 21-22",
        }
        day_names = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday"}

        free_slots = []
        for day in range(1, 6):
            for period in range(1, 12):
                if (day, period) not in user_slots:
                    free_slots.append(
                        {
                            "day_of_week": day,
                            "period": period,
                            "label": f'{day_names[day]} {period_labels.get(period, f"Period {period}")}',
                        }
                    )

        return Response({"free_slots": free_slots})


class RecommendView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request, day=None, period=None):
        try:
            day_of_week = int(day)
            period_num = int(period)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid day or period"}, status=status.HTTP_400_BAD_REQUEST)

        major_id = request.query_params.get("major")
        category = request.query_params.get("category")
        if not major_id:
            profile = getattr(request.user, "profile", None)
            if profile and profile.major:
                major = Major.objects.filter(name=profile.major).first()
                if major:
                    major_id = major.id

        courses = recommend_courses(
            day_of_week,
            period_num,
            major_id=int(major_id) if major_id else None,
            category=category,
        )

        return Response(
            {
                "day_of_week": day_of_week,
                "period": period_num,
                "courses": courses,
            }
        )
