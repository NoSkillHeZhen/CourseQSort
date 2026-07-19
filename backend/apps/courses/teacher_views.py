from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.courses.models import CourseScheduleItem, Teacher


class TeacherScheduleView(APIView):
    """教师的个人课表 — 从 CourseScheduleItem 读取已排好的课程"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            # 尝试从当前用户获取关联教师
            teacher = Teacher.objects.filter(user=request.user).first()
            if not teacher:
                return Response(
                    {"detail": "未关联教师账号或缺少 teacher_id 参数"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            teacher_id = teacher.id

        items = (
            CourseScheduleItem.objects.filter(
                teacher_id=teacher_id,
            )
            .select_related("course", "classroom")
            .order_by("day_of_week", "period")
        )

        # 按课程分组
        course_map = {}
        for item in items:
            cid = item.course_id
            if cid not in course_map:
                course_map[cid] = {
                    "course_id": item.course.id,
                    "name": item.course.name,
                    "code": item.course.code or "",
                    "credit": item.course.credit or 0,
                    "hours": item.course.hours or 0,
                    "is_professional_course": item.course.is_professional_course,
                    "expected_student_count": item.course.expected_student_count or 0,
                    "time_slots": [],
                }
            course_map[cid]["time_slots"].append(
                {
                    "day_of_week": item.day_of_week,
                    "period": item.period,
                    "week_start": item.week_start,
                    "week_end": item.week_end,
                    "classroom": item.classroom.name if item.classroom else "",
                }
            )

        courses = sorted(course_map.values(), key=lambda c: c["name"])

        # 教师信息
        teacher = Teacher.objects.filter(id=teacher_id).first()
        teacher_info = None
        if teacher:
            teacher_info = {
                "id": teacher.id,
                "name": teacher.name,
                "employee_no": teacher.employee_no,
                "department": teacher.department,
            }

        return Response(
            {
                "teacher": teacher_info,
                "courses": courses,
                "total_courses": len(courses),
            }
        )
