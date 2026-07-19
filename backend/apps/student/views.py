import time

from django.db import IntegrityError, OperationalError, transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStudentUser
from apps.courses.models import Course, Major
from apps.student.bitmap import build_bitmap, has_conflict
from apps.student.models import Enrollment
from apps.student.recommendation import recommend_courses


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

            first_teacher = course.teachers.first()
            teacher_name = first_teacher.name if first_teacher else ""

            first_item = items.first()
            classroom_name = first_item.classroom.name if first_item and first_item.classroom else ""

            courses_data.append(
                {
                    "course_id": course.id,
                    "name": course.name,
                    "teacher": teacher_name,
                    "time_slots": [{"day_of_week": day, "period": period} for day, period in time_slots],
                    "classroom": classroom_name,
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

        results = []
        for course in courses:
            time_slots_raw = list({(item.day_of_week, item.period) for item in course.schedule_items.all()})
            course_bitmap = build_bitmap(time_slots_raw)
            conflict = has_conflict(user_bitmap, course_bitmap)

            conflict_with = []
            if conflict:
                for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
                    enrollment_slots = {
                        (item.day_of_week, item.period) for item in enrollment.course.schedule_items.all()
                    }
                    overlap = enrollment_slots & set(time_slots_raw)
                    if overlap:
                        conflict_with.append(
                            {
                                "course_id": enrollment.course.id,
                                "name": enrollment.course.name,
                                "time_slots": [
                                    {"day_of_week": day, "period": period} for day, period in overlap
                                ],
                            }
                        )

            first_teacher = course.teachers.first()
            teacher_name = first_teacher.name if first_teacher else ""
            enrolled_count = course.enrollments.count()
            capacity = course.expected_student_count or 9999

            results.append(
                {
                    "course_id": course.id,
                    "name": course.name,
                    "credit": course.credit,
                    "teacher": teacher_name,
                    "capacity": capacity,
                    "enrolled_count": enrolled_count,
                    "time_slots": [{"day_of_week": day, "period": period} for day, period in time_slots_raw],
                    "remaining_capacity": capacity - enrolled_count,
                    "conflict": conflict,
                    "conflict_with": conflict_with,
                }
            )

        return Response({"count": len(results), "results": results})


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
            enrollment_slots = {(item.day_of_week, item.period) for item in enrollment.course.schedule_items.all()}
            overlap = enrollment_slots & set(course_slots_raw)
            if overlap:
                for day, period in overlap:
                    conflict_slots.add((day, period))
                    first_item = enrollment.course.schedule_items.filter(day_of_week=day, period=period).first()
                    classroom_name = first_item.classroom.name if first_item and first_item.classroom else ""
                    first_teacher = enrollment.course.teachers.first()
                    teacher_name = first_teacher.name if first_teacher else ""
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
        for attempt in range(3):
            try:
                with transaction.atomic():
                    course = Course.objects.select_for_update().prefetch_related("schedule_items").get(id=pk)

                    if Enrollment.objects.filter(user=request.user, course=course).exists():
                        return Response(
                            {
                                "course_id": course.id,
                                "status": "ALREADY_SELECTED",
                                "message": "Already selected",
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    capacity = course.expected_student_count or 9999
                    if course.enrollments.count() >= capacity:
                        return Response(
                            {
                                "course_id": course.id,
                                "status": "FULL",
                                "message": f"The course is full ({capacity}/{capacity})",
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    user_slots = set()
                    for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
                        for item in enrollment.course.schedule_items.all():
                            user_slots.add((item.day_of_week, item.period))

                    course_slots = {(item.day_of_week, item.period) for item in course.schedule_items.all()}
                    overlap = user_slots & course_slots
                    if overlap:
                        conflict_names = []
                        for enrollment in Enrollment.objects.filter(user=request.user).select_related("course"):
                            enrollment_slots = {
                                (item.day_of_week, item.period) for item in enrollment.course.schedule_items.all()
                            }
                            if enrollment_slots & course_slots:
                                conflict_names.append(enrollment.course.name)

                        return Response(
                            {
                                "course_id": course.id,
                                "status": "CONFLICT",
                                "message": f'Time conflict with selected courses: {", ".join(conflict_names)}',
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    Enrollment.objects.create(user=request.user, course=course)
                    return Response(
                        {
                            "course_id": course.id,
                            "status": "SELECTED",
                            "message": "Selected",
                        },
                        status=status.HTTP_201_CREATED,
                    )
            except Course.DoesNotExist:
                return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
            except IntegrityError:
                return Response(
                    {
                        "course_id": pk,
                        "status": "ALREADY_SELECTED",
                        "message": "Already selected",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            except OperationalError:
                if attempt == 2:
                    if Enrollment.objects.filter(user=request.user, course_id=pk).exists():
                        return Response(
                            {
                                "course_id": pk,
                                "status": "ALREADY_SELECTED",
                                "message": "Already selected",
                            },
                            status=status.HTTP_409_CONFLICT,
                        )
                    return Response(
                        {
                            "course_id": pk,
                            "status": "BUSY",
                            "message": "Selection is busy, please retry",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                time.sleep(0.05)


class DropCourseView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def delete(self, request, pk=None):
        try:
            course = Course.objects.get(id=pk)
        except Course.DoesNotExist:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

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
