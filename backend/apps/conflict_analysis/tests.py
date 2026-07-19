import time
import uuid
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.conflict_analysis.models import ConflictAnalysisResult, ConflictPair, ConflictTaskRecord
from apps.courses.models import Course, CourseScheduleItem
from apps.conflict_analysis.tasks import run_analysis_sync


class ConflictAnalysisTestMixin:
    def create_course(self, name, semester="2026-1"):
        return Course.objects.create(
            name=name,
            code=name.upper().replace(" ", "-")[:20],
            credit=2.0,
            semester=semester,
            course_id_from_source=f"conflict-{uuid.uuid4().hex[:12]}",
        )


class ConflictAnalysisApiTests(ConflictAnalysisTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="conflict-admin",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Conflict Admin",
        )
        self.client.force_authenticate(self.admin_user)

        self.course_a = self.create_course("Conflict Course A")
        self.course_b = self.create_course("Conflict Course B")
        self.course_c = self.create_course("Conflict Course C")

    def test_run_endpoint_creates_result_and_task(self):
        def fake_run(task_id):
            task = ConflictTaskRecord.objects.get(task_id=task_id)
            task.status = "SUCCESS"
            task.progress = 1.0
            task.conflict_pairs_found = 2
            task.save(update_fields=["status", "progress", "conflict_pairs_found"])

        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            response = self.client.post(
                "/api/v1/admin/conflict-analysis/run/",
                {
                    "semester": "2026-1",
                    "course_ids": [self.course_a.id, self.course_b.id],
                    "threshold": 2,
                },
                format="json",
            )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(ConflictAnalysisResult.objects.count(), 1)
        self.assertEqual(ConflictTaskRecord.objects.count(), 1)

    def test_task_status_returns_serialized_record(self):
        result = ConflictAnalysisResult.objects.create(
            semester="2026-1",
            course_count=3,
            threshold=2,
        )
        task = ConflictTaskRecord.objects.create(
            result=result,
            status="SUCCESS",
            progress=1.0,
            analyzed_pairs=3,
            total_pairs=3,
            conflict_pairs_found=1,
        )

        response = self.client.get(f"/api/v1/admin/conflict-analysis/tasks/{task.task_id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "SUCCESS")
        self.assertEqual(response.data["conflict_pairs_found"], 1)

    def test_pairs_endpoint_filters_by_threshold(self):
        result = ConflictAnalysisResult.objects.create(
            semester="2026-1",
            course_count=3,
            conflict_pairs_count=2,
            threshold=1,
        )
        ConflictPair.objects.create(
            result=result,
            course_a=self.course_a,
            course_b=self.course_b,
            conflicting_student_count=2,
            conflict_rate=0.3,
        )
        ConflictPair.objects.create(
            result=result,
            course_a=self.course_a,
            course_b=self.course_c,
            conflicting_student_count=5,
            conflict_rate=0.7,
        )

        response = self.client.get(
            f"/api/v1/admin/conflict-analysis/results/{result.id}/pairs/",
            {"threshold": 4},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["course_b"]["id"],
            self.course_c.id,
        )

    def test_run_endpoint_executes_real_conflict_analysis(self):
        CourseScheduleItem.objects.create(
            course=self.course_a,
            day_of_week=1,
            period=1,
        )
        CourseScheduleItem.objects.create(
            course=self.course_a,
            day_of_week=1,
            period=2,
        )
        CourseScheduleItem.objects.create(
            course=self.course_b,
            day_of_week=1,
            period=2,
        )
        CourseScheduleItem.objects.create(
            course=self.course_b,
            day_of_week=2,
            period=1,
        )
        CourseScheduleItem.objects.create(
            course=self.course_c,
            day_of_week=3,
            period=1,
        )

        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            response = self.client.post(
                "/api/v1/admin/conflict-analysis/run/",
                {
                    "semester": "2026-1",
                    "course_ids": [self.course_a.id, self.course_b.id, self.course_c.id],
                    "threshold": 1,
                },
                format="json",
            )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")

        task = ConflictTaskRecord.objects.get(task_id=response.data["task_id"])
        run_analysis_sync(str(task.task_id))
        task.refresh_from_db()
        result = task.result
        pair = ConflictPair.objects.get(result=result)

        self.assertEqual(task.status, "SUCCESS")
        self.assertEqual(task.total_pairs, 3)
        self.assertEqual(task.analyzed_pairs, 3)
        self.assertEqual(task.conflict_pairs_found, 1)
        self.assertEqual(result.course_count, 3)
        self.assertEqual(result.conflict_pairs_count, 1)
        self.assertEqual(
            {pair.course_a_id, pair.course_b_id},
            {self.course_a.id, self.course_b.id},
        )
        self.assertEqual(pair.conflicting_student_count, 1)
        self.assertAlmostEqual(pair.conflict_rate, 1.0, places=2)


class ConflictAnalysisPerformanceTests(ConflictAnalysisTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="conflict-performance-admin",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Conflict Performance Admin",
        )
        self.client.force_authenticate(self.admin_user)

        self.courses = []
        for index in range(32):
            course = self.create_course(f"Perf Conflict Course {index:02d}")
            self.courses.append(course)
            CourseScheduleItem.objects.create(
                course=course,
                day_of_week=(index % 5) + 1,
                period=(index % 4) + 1,
            )
            CourseScheduleItem.objects.create(
                course=course,
                day_of_week=((index + 1) % 5) + 1,
                period=((index + 1) % 4) + 1,
            )

    def test_conflict_analysis_performance_smoke(self):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start.return_value = None
            started_at = time.perf_counter()
            response = self.client.post(
                "/api/v1/admin/conflict-analysis/run/",
                {
                    "semester": "2026-1",
                    "course_ids": [course.id for course in self.courses],
                    "threshold": 1,
                },
                format="json",
            )
        task = ConflictTaskRecord.objects.get(task_id=response.data["task_id"])
        run_analysis_sync(str(task.task_id))
        duration = time.perf_counter() - started_at

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "PENDING")
        task.refresh_from_db()
        expected_pairs = len(self.courses) * (len(self.courses) - 1) // 2
        self.assertEqual(task.status, "SUCCESS")
        self.assertEqual(task.total_pairs, expected_pairs)
        self.assertEqual(task.analyzed_pairs, expected_pairs)
        self.assertLess(duration, 5.0)
