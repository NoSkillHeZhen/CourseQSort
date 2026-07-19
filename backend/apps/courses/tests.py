import json

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.courses.models import ClassGroup, Course, CourseAssignment, Major, Student, Teacher


class CourseImportIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="course-admin",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Course Admin",
        )
        self.client.force_authenticate(self.admin_user)
        self.major = Major.objects.create(name="Clinical Medicine", code="CM")

    def _build_json_upload(self, records):
        return SimpleUploadedFile(
            "courses.json",
            json.dumps(records, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
        )

    def test_import_endpoint_creates_courses_and_links_teachers(self):
        upload = self._build_json_upload(
            [
                {
                    "courseId": "import-med101",
                    "courseName": "Medical Statistics",
                    "courseNum": "MED101",
                    "score": 3,
                    "yearTerm": "2026-1",
                    "openingUnitName": "Clinical Medicine",
                    "courseCategoryName": "专必",
                    "limitNumber": 80,
                    "teachingName": "Teacher One, Teacher Two",
                    "readObj": "Clinical Medicine 2024级 Clinical Medicine",
                    "teachingTimePlaceStr": "",
                }
            ]
        )

        response = self.client.post(
            "/api/v1/admin/courses/import/",
            {"file": upload},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["imported_count"], 1)
        self.assertEqual(response.data["errors"], [])

        course = Course.objects.get(name="Medical Statistics")
        self.assertEqual(course.code, "MED101")
        self.assertEqual(course.expected_student_count, 80)
        self.assertEqual(course.course_id_from_source, "import-med101")
        self.assertEqual(course.teachers.count(), 2)
        self.assertSetEqual(
            set(course.teachers.values_list("name", flat=True)),
            {"Teacher One", "Teacher Two"},
        )
        self.assertFalse(Teacher.objects.filter(name="Teacher Three").exists())


class CourseAdminApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="course-admin-api",
            password="secret123",
        )
        Profile.objects.create(
            user=self.admin_user,
            role="ADMIN",
            name="Course Admin Api",
        )
        self.client.force_authenticate(self.admin_user)

        self.major = Major.objects.create(name="Computer Science", code="CS")
        self.teacher = Teacher.objects.create(name="Teacher API", employee_no="T900")
        self.course = Course.objects.create(
            name="Algorithms",
            code="CS101",
            credit=3.0,
            semester="2026-1",
            major=self.major,
            course_id_from_source="api-course-001",
        )
        self.course.teachers.add(self.teacher)

    def test_course_list_filters_by_keyword(self):
        Course.objects.create(
            name="Networks",
            code="CS102",
            credit=2.0,
            semester="2026-1",
            course_id_from_source="api-course-002",
        )

        response = self.client.get("/api/v1/admin/courses/", {"keyword": "Algo"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Algorithms")

    def test_assign_endpoint_enrolls_matching_students(self):
        class_group = ClassGroup.objects.create(name="CS2401", major=self.major, grade="2024")
        user = User.objects.create_user(username="student-course-assign", password="secret123")
        Profile.objects.create(user=user, role="STUDENT", name="Student Assign")
        Student.objects.create(
            user=user,
            student_no="S900",
            name="Student Assign",
            major=self.major,
            grade="2024",
            class_group=class_group,
            class_identification="CS2401",
        )

        response = self.client.post(
            f"/api/v1/admin/courses/{self.course.id}/assign/",
            {"major_id": self.major.id, "grade": "2024"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["assigned_count"], 1)
        self.assertTrue(CourseAssignment.objects.filter(course=self.course, major=self.major, grade="2024").exists())

    def test_delete_all_requires_password(self):
        response = self.client.post(
            "/api/v1/admin/courses/delete_all/",
            {"password": "bad-password"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
