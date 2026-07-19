import time
import random
import time
import uuid
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.courses.models import Classroom, Course, CourseScheduleItem, Teacher
from apps.protected_slots.models import ProtectedSlot
from apps.scheduling.algorithm.constraints import check_hard_constraints, is_feasible
from apps.scheduling.models import ScheduleEntry, SchedulePlan, TaskRecord
from apps.scheduling.tasks import run_generate_sync


class ConstraintAlgorithmTests(SimpleTestCase):
    def setUp(self):
        self.course_map = {
            1: {"name": "Algorithms"},
            2: {"name": "Databases"},
        }
        self.teacher_map = {
            1: {"name": "Teacher A"},
            2: {"unavailable_slots": []},
        }
        self.classroom_map = {
            1: {"name": "Room 101"},
            2: {"name": "Room 102"},
        }

    def test_check_hard_constraints_reports_teacher_and_classroom_conflicts(self):
        assignments = [
            (1, 1, 2, 3, 2, 1, 1),
            (2, 1, 2, 3, 2, 1, 1),
        ]

        violations = check_hard_constraints(
            assignments,
            self.course_map,
            self.teacher_map,
            self.classroom_map,
        )
        violation_types = {item[0] for item in violations}

        self.assertTrue(
            {
                "TEACHER_CONFLICT",
                "CLASSROOM_CONFLICT",
            }.issubset(violation_types)
        )

    def test_check_hard_constraints_returns_empty_for_non_conflicting_schedule(self):
        assignments = [
            (1, 1, 1, 1, 2, 1, 1),
            (2, 1, 3, 5, 2, 2, 2),
        ]

        violations = check_hard_constraints(
            assignments,
            self.course_map,
            self.teacher_map,
            self.classroom_map,
        )

        self.assertEqual(violations, [])

    def test_is_feasible_returns_true_for_non_conflicting_schedule(self):
        assignments = [
            (1, 1, 1, 1, 2, 1, 1),
            (2, 2, 2, 2, 2, 2, 2),
        ]

        self.assertTrue(
            is_feasible(
                assignments,
                self.course_map,
                self.teacher_map,
                self.classroom_map,
            )
        )


class SchedulingApiTestMixin:
    def create_course(self, name, semester="2026-1"):
        return Course.objects.create(
            name=name,
            code=name.upper().replace(" ", "-")[:20],
            credit=2.0,
            semester=semester,
            course_id_from_source=f"schedule-{uuid.uuid4().hex[:12]}",
        )


class SchedulingAdminApiTests(SchedulingApiTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="schedule-admin",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Schedule Admin",
        )
        self.client.force_authenticate(self.admin_user)

        self.teacher = Teacher.objects.create(name="Schedule Teacher", employee_no="SCH001")
        self.classroom = Classroom.objects.create(name="Schedule Room", capacity=80)
        self.course = self.create_course("Schedule Course")

    def test_generate_endpoint_creates_plan_and_successful_task(self):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            response = self.client.post(
                "/api/v1/admin/schedule/generate/",
                {
                    "plan_name": "Plan A",
                    "semester": "2026-1",
                    "major_ids": [1, 2],
                    "algorithm_config": {"population_size": 120},
                },
                format="json",
            )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(SchedulePlan.objects.count(), 1)
        self.assertEqual(TaskRecord.objects.count(), 1)
        self.assertEqual(SchedulePlan.objects.get().created_by_id, self.admin_user.id)

        task = TaskRecord.objects.get()
        run_generate_sync(str(task.task_id))
        task.refresh_from_db()
        self.assertEqual(task.status, "SUCCESS")

    def test_task_status_includes_plan_id_for_successful_task(self):
        plan = SchedulePlan.objects.create(
            plan_name="Plan B",
            semester="2026-1",
            major_ids=[1],
            created_by=self.admin_user,
        )
        task = TaskRecord.objects.create(
            plan=plan,
            status="SUCCESS",
            progress=1.0,
        )

        response = self.client.get(f"/api/v1/admin/schedule/tasks/{task.task_id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "SUCCESS")
        self.assertEqual(response.data["plan_id"], plan.id)

    def test_plan_evaluation_counts_distribution_and_protected_slots(self):
        plan = SchedulePlan.objects.create(
            plan_name="Plan C",
            semester="2026-1",
            major_ids=[1],
            overall_fitness=88.0,
            created_by=self.admin_user,
        )
        ScheduleEntry.objects.create(
            plan=plan,
            course=self.course,
            teacher=self.teacher,
            classroom=self.classroom,
            day_of_week=1,
            period=1,
            student_group_ids=[101, 102],
        )
        ScheduleEntry.objects.create(
            plan=plan,
            course=self.create_course("Schedule Course 2"),
            teacher=self.teacher,
            classroom=self.classroom,
            day_of_week=1,
            period=2,
            student_group_ids=[103],
        )
        ProtectedSlot.objects.create(
            day_of_week=1,
            start_period=1,
            end_period=1,
            description="Protected Monday first slot",
        )

        response = self.client.get(f"/api/v1/admin/schedule/plans/{plan.id}/evaluation/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["plan_id"], plan.id)
        self.assertEqual(response.data["class_count"], 2)
        self.assertEqual(response.data["protected_slot_occupied"], 1)
        self.assertEqual(response.data["daily_distribution"]["monday"], 2)

    def test_publish_marks_plan_as_published(self):
        plan = SchedulePlan.objects.create(
            plan_name="Plan D",
            semester="2026-1",
            major_ids=[1],
            created_by=self.admin_user,
        )
        ScheduleEntry.objects.create(
            plan=plan,
            course=self.course,
            teacher=self.teacher,
            classroom=self.classroom,
            day_of_week=1,
            period=1,
        )

        response = self.client.post(f"/api/v1/admin/schedule/plans/{plan.id}/publish/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "PUBLISHED")
        plan.refresh_from_db()
        self.assertEqual(plan.status, "PUBLISHED")
        self.assertIsNotNone(plan.published_at)

    def test_override_creates_entry_for_draft_plan(self):
        plan = SchedulePlan.objects.create(
            plan_name="Plan E",
            semester="2026-1",
            major_ids=[1],
            created_by=self.admin_user,
        )

        response = self.client.post(
            f"/api/v1/admin/schedule/plans/{plan.id}/override/",
            {
                "course_id": self.course.id,
                "day_of_week": 3,
                "period": 4,
                "teacher_id": self.teacher.id,
                "classroom_id": self.classroom.id,
                "reason": "manual adjust",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        entry = ScheduleEntry.objects.get(plan=plan, course=self.course)
        self.assertEqual(entry.day_of_week, 3)
        self.assertEqual(entry.period, 4)
        self.assertEqual(entry.teacher_id, self.teacher.id)
        self.assertEqual(entry.classroom_id, self.classroom.id)

    def test_export_returns_excel_file(self):
        plan = SchedulePlan.objects.create(
            plan_name="Plan F",
            semester="2026-1",
            major_ids=[1],
            created_by=self.admin_user,
        )
        ScheduleEntry.objects.create(
            plan=plan,
            course=self.course,
            teacher=self.teacher,
            classroom=self.classroom,
            day_of_week=2,
            period=3,
        )

        response = self.client.post(f"/api/v1/admin/schedule/plans/{plan.id}/export/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment;", response["Content-Disposition"])
        self.assertGreater(len(response.content), 0)

    def test_generate_endpoint_executes_real_genetic_scheduler(self):
        second_teacher = Teacher.objects.create(
            name="Schedule Teacher 2",
            employee_no="SCH002",
        )
        Classroom.objects.create(
            name="Schedule Room 2",
            capacity=90,
        )
        second_course = self.create_course("Schedule Course 2")

        self.course.teachers.add(self.teacher)
        second_course.teachers.add(second_teacher)

        random.seed(20260719)
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            response = self.client.post(
                "/api/v1/admin/schedule/generate/",
                {
                    "plan_name": "Real GA Plan",
                    "semester": "2026-1",
                    "major_ids": [],
                    "algorithm_config": {
                        "population_size": 12,
                        "max_generations": 8,
                        "mutation_rate": 0.08,
                        "crossover_rate": 0.8,
                        "total_weeks": 1,
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")

        task = TaskRecord.objects.get(task_id=response.data["task_id"])
        run_generate_sync(str(task.task_id))
        task.refresh_from_db()
        plan = task.plan
        entries = list(plan.entries.order_by("course_id"))
        expected_entries = 48 * 2

        self.assertEqual(task.status, "SUCCESS")
        self.assertEqual(len(entries), expected_entries)
        self.assertGreaterEqual(plan.overall_fitness, 0.0)
        self.assertLessEqual(plan.overall_fitness, 1.0)
        self.assertSetEqual(
            {entry.course_id for entry in entries},
            {self.course.id, second_course.id},
        )
        for entry in entries:
            self.assertIn(entry.day_of_week, [1, 2, 3, 4, 5])
            self.assertGreaterEqual(entry.period, 1)
            self.assertLessEqual(entry.period, 11)
            self.assertEqual(entry.week, 1)


class SchedulingPerformanceTests(SchedulingApiTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="schedule-performance-admin",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Schedule Performance Admin",
        )
        self.client.force_authenticate(self.admin_user)

        self.teacher = Teacher.objects.create(name="Schedule Performance Teacher", employee_no="SP001")
        self.classroom = Classroom.objects.create(name="Schedule Performance Room", capacity=120)

        for index in range(24):
            course = self.create_course(f"Perf Schedule Course {index:02d}")
            course.teachers.add(self.teacher)
            for offset in range(2):
                CourseScheduleItem.objects.create(
                    course=course,
                    teacher=self.teacher,
                    classroom=self.classroom,
                    day_of_week=((index + offset) % 5) + 1,
                    period=((index * 2 + offset) % 11) + 1,
                    week_start=1,
                    week_end=4,
                )

    def test_schedule_generation_performance_smoke(self):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            started_at = time.perf_counter()
            response = self.client.post(
                "/api/v1/admin/schedule/generate/",
                {
                    "plan_name": "Performance Plan",
                    "semester": "2026-1",
                    "major_ids": [],
                    "algorithm_config": {"total_weeks": 4},
                },
                format="json",
            )
        task = TaskRecord.objects.get(task_id=response.data["task_id"])
        run_generate_sync(str(task.task_id))
        duration = time.perf_counter() - started_at

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")
        task.refresh_from_db()
        self.assertEqual(task.status, "SUCCESS")
        self.assertEqual(task.plan.entries.count(), 24 * 48)
        self.assertLess(duration, 20.0)
