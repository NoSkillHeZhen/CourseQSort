import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.contrib.auth.models import User
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.courses.models import Classroom, Course, CourseScheduleItem, Major, Teacher
from apps.student.models import Enrollment
from apps.student.recommendation import recommend_courses


class StudentTestMixin:
    def create_course(
        self,
        name,
        *,
        major=None,
        expected_student_count=30,
        is_professional_course=True,
        semester="2026-1",
    ):
        return Course.objects.create(
            name=name,
            code=name.upper().replace(" ", "-")[:20],
            credit=2.0,
            semester=semester,
            major=major,
            expected_student_count=expected_student_count,
            is_professional_course=is_professional_course,
            course_id_from_source=f"test-{uuid.uuid4().hex[:12]}",
        )


class RecommendationTests(StudentTestMixin, TestCase):
    def test_recommend_courses_deduplicates_and_filters_by_major(self):
        target_major = Major.objects.create(name="Clinical Medicine", code="CM")
        other_major = Major.objects.create(name="Law", code="LAW")
        teacher = Teacher.objects.create(name="Teacher A", employee_no="T001")
        room = Classroom.objects.create(name="Room 101", capacity=60)

        target_course = self.create_course("Target Course", major=target_major)
        other_course = self.create_course("Other Course", major=other_major)

        CourseScheduleItem.objects.create(
            course=target_course,
            teacher=teacher,
            classroom=room,
            day_of_week=1,
            period=1,
        )
        CourseScheduleItem.objects.create(
            course=target_course,
            teacher=teacher,
            classroom=room,
            day_of_week=1,
            period=1,
        )
        CourseScheduleItem.objects.create(
            course=other_course,
            teacher=teacher,
            classroom=room,
            day_of_week=1,
            period=1,
        )

        results = recommend_courses(1, 1, major_id=target_major.id)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["course_id"], target_course.id)
        self.assertEqual(results[0]["remaining_capacity"], target_course.expected_student_count)
        self.assertEqual(results[0]["time_slots"], [{"day_of_week": 1, "period": 1}])

    def test_recommend_courses_respects_category_filter(self):
        major = Major.objects.create(name="Pharmacy", code="PH")
        teacher = Teacher.objects.create(name="Teacher B", employee_no="T002")
        room = Classroom.objects.create(name="Room 102", capacity=60)
        course = self.create_course("Professional Course", major=major)

        CourseScheduleItem.objects.create(
            course=course,
            teacher=teacher,
            classroom=room,
            day_of_week=2,
            period=2,
        )

        all_results = recommend_courses(2, 2, major_id=major.id)
        category = all_results[0]["category"]

        filtered_results = recommend_courses(
            2,
            2,
            major_id=major.id,
            category=category,
        )
        non_matching_results = recommend_courses(
            2,
            2,
            major_id=major.id,
            category="not-a-real-category",
        )

        self.assertEqual(len(filtered_results), 1)
        self.assertEqual(filtered_results[0]["course_id"], course.id)
        self.assertEqual(non_matching_results, [])


class StudentCourseApiTests(StudentTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="student-api", password="secret123")
        Profile.objects.create(user=self.user, role="STUDENT", name="Student API")
        self.client.force_authenticate(self.user)

        self.teacher = Teacher.objects.create(name="Teacher C", employee_no="T003")
        self.room = Classroom.objects.create(name="Room 201", capacity=60)

        self.enrolled_course = self.create_course("Enrolled Course")
        CourseScheduleItem.objects.create(
            course=self.enrolled_course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=1,
            period=1,
        )
        Enrollment.objects.create(user=self.user, course=self.enrolled_course)

        self.conflicting_course = self.create_course("Conflicting Course")
        CourseScheduleItem.objects.create(
            course=self.conflicting_course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=1,
            period=1,
        )

        self.available_course = self.create_course("Available Course")
        CourseScheduleItem.objects.create(
            course=self.available_course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=1,
            period=2,
        )

        self.full_course = self.create_course("Full Course", expected_student_count=1)
        CourseScheduleItem.objects.create(
            course=self.full_course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=1,
            period=3,
        )
        other_user = User.objects.create_user(username="other-student", password="secret123")
        Profile.objects.create(user=other_user, role="STUDENT", name="Other Student")
        Enrollment.objects.create(user=other_user, course=self.full_course)

    def test_student_course_list_marks_time_conflicts(self):
        response = self.client.get("/api/v1/student/courses/")

        self.assertEqual(response.status_code, 200)
        by_course_id = {item["course_id"]: item for item in response.data["results"]}

        self.assertTrue(by_course_id[self.conflicting_course.id]["conflict"])
        self.assertEqual(
            by_course_id[self.conflicting_course.id]["conflict_with"][0]["course_id"],
            self.enrolled_course.id,
        )
        self.assertFalse(by_course_id[self.available_course.id]["conflict"])

    def test_select_course_rejects_conflicting_schedule(self):
        response = self.client.post(f"/api/v1/student/courses/{self.conflicting_course.id}/select/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["status"], "CONFLICT")
        self.assertFalse(Enrollment.objects.filter(user=self.user, course=self.conflicting_course).exists())

    def test_select_course_rejects_full_course(self):
        response = self.client.post(f"/api/v1/student/courses/{self.full_course.id}/select/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["status"], "FULL")

    def test_select_course_creates_enrollment_when_slot_is_available(self):
        response = self.client.post(f"/api/v1/student/courses/{self.available_course.id}/select/")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "SELECTED")
        self.assertTrue(Enrollment.objects.filter(user=self.user, course=self.available_course).exists())

    def test_course_list_handles_injection_like_keyword_without_server_error(self):
        response = self.client.get("/api/v1/student/courses/", {"keyword": "' OR 1=1 --"})

        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)


class AdminCourseApiTests(StudentTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(username="admin-user", password="secret123")
        Profile.objects.create(user=self.admin_user, role="ADMIN", name="Admin User")
        self.student_user = User.objects.create_user(username="plain-student", password="secret123")
        Profile.objects.create(user=self.student_user, role="STUDENT", name="Plain Student")

    def test_admin_course_list_is_paginated(self):
        for index in range(21):
            self.create_course(f"Course {index:02d}")

        self.client.force_authenticate(self.admin_user)
        response = self.client.get("/api/v1/admin/courses/", {"page": 2})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 21)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNotNone(response.data["previous"])

    def test_course_admin_endpoint_requires_admin_role(self):
        self.create_course("Protected Course")

        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/v1/admin/courses/")

        self.assertEqual(response.status_code, 403)


class StudentCourseConcurrencyTests(StudentTestMixin, TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="concurrency-user", password="secret123")
        Profile.objects.create(user=self.user, role="STUDENT", name="Concurrency User")

        self.teacher = Teacher.objects.create(name="Teacher D", employee_no="T004")
        self.room = Classroom.objects.create(name="Room 301", capacity=60)
        self.course = self.create_course("Concurrent Course", expected_student_count=5)
        CourseScheduleItem.objects.create(
            course=self.course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=2,
            period=2,
        )

    def _post_select(self, barrier):
        client = APIClient()
        client.force_authenticate(self.user)
        barrier.wait()
        response = client.post(f"/api/v1/student/courses/{self.course.id}/select/")
        return response.status_code, response.data

    def test_concurrent_duplicate_selection_keeps_single_enrollment(self):
        barrier = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: self._post_select(barrier), range(2)))

        self.assertEqual(
            sorted(status_code for status_code, _ in results),
            [201, 409],
        )
        self.assertEqual(Enrollment.objects.filter(user=self.user, course=self.course).count(), 1)
        self.assertIn(
            "ALREADY_SELECTED",
            [payload["status"] for _, payload in results if payload["status"] != "SELECTED"],
        )


class StudentCoursePerformanceTests(StudentTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="performance-user", password="secret123")
        Profile.objects.create(user=self.user, role="STUDENT", name="Performance User")
        self.client.force_authenticate(self.user)

        self.teacher = Teacher.objects.create(name="Teacher E", employee_no="T005")
        self.room = Classroom.objects.create(name="Room 401", capacity=80)

        enrolled_course = self.create_course("Baseline Course")
        CourseScheduleItem.objects.create(
            course=enrolled_course,
            teacher=self.teacher,
            classroom=self.room,
            day_of_week=1,
            period=1,
        )
        Enrollment.objects.create(user=self.user, course=enrolled_course)

        for index in range(80):
            course = self.create_course(f"Perf Course {index:02d}")
            CourseScheduleItem.objects.create(
                course=course,
                teacher=self.teacher,
                classroom=self.room,
                day_of_week=(index % 5) + 1,
                period=(index % 4) + 1,
            )

    def test_course_list_performance_smoke(self):
        started_at = time.perf_counter()
        response = self.client.get("/api/v1/student/courses/")
        duration = time.perf_counter() - started_at

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 81)
        self.assertLess(duration, 5.0)
