import io

import openpyxl
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminUser
from apps.common.pagination import PageNumberPagination
from apps.courses.models import Course
from apps.scheduling.models import ScheduleEntry, SchedulePlan, TaskRecord
from apps.scheduling.serializers import (
    GenerateSerializer,
    OverrideSerializer,
    SchedulePlanDetailSerializer,
    SchedulePlanListSerializer,
    TaskStatusSerializer,
)


class GenerateView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def create(self, request):
        serializer = GenerateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        plan = SchedulePlan.objects.create(
            plan_name=serializer.validated_data["plan_name"],
            semester=serializer.validated_data["semester"],
            major_ids=serializer.validated_data["major_ids"],
            algorithm_config=serializer.validated_data.get("algorithm_config", {}),
            status="DRAFT",
            created_by=request.user,
        )

        task = TaskRecord.objects.create(
            plan=plan,
            status="PENDING",
            progress=0.0,
        )

        # 异步线程执行，立即返回给前端轮询
        import threading

        from apps.scheduling.tasks import run_generate_sync

        task_id = str(task.task_id)
        thread = threading.Thread(target=run_generate_sync, args=(task_id,), daemon=True)
        thread.start()

        serializer = TaskStatusSerializer(task)
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class TaskStatusView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def retrieve(self, request, pk=None):
        try:
            task = TaskRecord.objects.get(task_id=pk)
        except TaskRecord.DoesNotExist:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = TaskStatusSerializer(task)
        data = serializer.data
        if task.plan and task.status == "SUCCESS":
            data["plan_id"] = task.plan.id
        return Response(data)


class PlanViewSet(viewsets.ModelViewSet):
    queryset = SchedulePlan.objects.all()
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    def get_serializer_class(self):
        if self.action == "list":
            return SchedulePlanListSerializer
        return SchedulePlanDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list":
            return qs
        return qs.prefetch_related("entries__course", "entries__teacher", "entries__classroom")

    def destroy(self, request, *args, **kwargs):
        plan = self.get_object()
        plan.delete()
        return Response({"detail": "方案已删除"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def evaluation(self, request, pk=None):
        plan = self.get_object()
        entries = plan.entries.select_related("course").all()
        students = set()
        daily_count = {"monday": 0, "tuesday": 0, "wednesday": 0, "thursday": 0, "friday": 0}
        day_map = {1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday"}

        for e in entries:
            day_key = day_map.get(e.day_of_week, "monday")
            daily_count[day_key] += 1
            for sid in e.student_group_ids or []:
                students.add(sid)

        total_hours = sum(daily_count.values())
        hours_list = [v for v in daily_count.values()]
        avg = total_hours / 5 if total_hours else 0
        variance = sum((h - avg) ** 2 for h in hours_list) / 5 if total_hours else 0

        from apps.protected_slots.models import ProtectedSlot

        protected_slots = ProtectedSlot.objects.all()
        occupied = 0
        for e in entries:
            for ps in protected_slots:
                if e.day_of_week == ps.day_of_week and ps.start_period <= e.period <= ps.end_period:
                    occupied += 1
                    break

        return Response(
            {
                "plan_id": plan.id,
                "overall_fitness": plan.overall_fitness or 0.0,
                "daily_hour_variance": round(variance, 2),
                "max_daily_hours": max(hours_list) if hours_list else 0,
                "min_daily_hours": min(hours_list) if hours_list else 0,
                "student_count": len(students) or entries.count(),
                "class_count": entries.count(),
                "daily_distribution": daily_count,
                "total_course_hours": total_hours,
                "protected_slot_occupied": occupied,
                "hard_constraint_violations": [],
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        plan = self.get_object()
        if plan.status == "PUBLISHED":
            return Response({"detail": "Plan already published"}, status=status.HTTP_400_BAD_REQUEST)

        from apps.courses.models import CourseScheduleItem

        entries = plan.entries.select_related("course", "teacher", "classroom").all()

        if not entries:
            return Response({"detail": "Plan has no entries"}, status=status.HTTP_400_BAD_REQUEST)

        # 收集本方案涉及的所有课程 ID
        course_ids = set(e.course_id for e in entries if e.course_id)

        # 清除这些课程现有的排课条目
        CourseScheduleItem.objects.filter(course_id__in=course_ids).delete()

        # 按 (course, teacher, classroom, day_of_week, period) 分组，
        # 合并连续周为 week_start~week_end
        groups = {}
        for e in entries:
            if not e.course_id:
                continue
            key = (e.course_id, e.teacher_id, e.classroom_id, e.day_of_week, e.period)
            if key not in groups:
                groups[key] = []
            groups[key].append(e.week or 1)

        items = []
        for (course_id, teacher_id, classroom_id, dow, period), weeks in groups.items():
            weeks = sorted(set(weeks))
            # 合并连续周
            ws = weeks[0]
            prev = weeks[0]
            for w in weeks[1:] + [None]:
                if w is None or w > prev + 1:
                    items.append(
                        CourseScheduleItem(
                            course_id=course_id,
                            teacher_id=teacher_id,
                            classroom_id=classroom_id,
                            day_of_week=dow,
                            period=period,
                            week_start=ws,
                            week_end=prev,
                        )
                    )
                    if w is not None:
                        ws = w
                prev = w if w is not None else prev

        if items:
            CourseScheduleItem.objects.bulk_create(items)

        plan.status = "PUBLISHED"
        plan.published_at = timezone.now()
        plan.save(update_fields=["status", "published_at"])

        return Response(
            {
                "plan_id": plan.id,
                "status": "PUBLISHED",
                "published_at": plan.published_at.isoformat(),
                "synced_courses": len(course_ids),
                "synced_items": len(items),
            }
        )

    @action(detail=True, methods=["post"])
    def export(self, request, pk=None):
        plan = self.get_object()
        entries = plan.entries.select_related("course", "teacher", "classroom").all()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = plan.plan_name[:30]
        ws.append(["课程名称", "课程编码", "教师", "教室", "星期", "节次"])

        day_names = {1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五"}
        for e in entries:
            ws.append(
                [
                    e.course.name if e.course else "",
                    e.course.code if e.course else "",
                    e.teacher.name if e.teacher else "",
                    e.classroom.name if e.classroom else "",
                    day_names.get(e.day_of_week, str(e.day_of_week)),
                    f"第{e.period}节",
                ]
            )

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return HttpResponse(
            output.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{plan.plan_name}.xlsx"'},
        )

    @action(detail=True, methods=["post"])
    def override(self, request, pk=None):
        plan = self.get_object()
        if plan.status == "PUBLISHED":
            return Response({"detail": "Cannot override a published plan"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = OverrideSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        course = Course.objects.filter(id=data["course_id"]).first()
        if not course:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

        entry, _ = ScheduleEntry.objects.update_or_create(
            plan=plan,
            course=course,
            defaults={
                "day_of_week": data["day_of_week"],
                "period": data["period"],
                "classroom_id": data.get("classroom_id"),
                "teacher_id": data.get("teacher_id"),
            },
        )

        return Response(
            {
                "item_id": entry.id,
                "evaluation": {
                    "overall_fitness": plan.overall_fitness or 0.0,
                    "adjusted": True,
                },
            }
        )
