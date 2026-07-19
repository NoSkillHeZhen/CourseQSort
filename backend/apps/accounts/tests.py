import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.courses.models import Student


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _create_student_user(self, username=None):
        username = username or f"user-{uuid.uuid4().hex[:8]}"
        user = User.objects.create_user(
            username=username,
            password="secret123",
            email=f"{username}@example.com",
        )
        Profile.objects.create(
            user=user,
            role="STUDENT",
            name="Student One",
            major="Computer Science",
        )
        return user

    def _login(self, username, password="secret123"):
        return self.client.post(
            "/api/v1/auth/login/",
            {"username": username, "password": password},
            format="json",
        )

    def test_register_binds_existing_student_record(self):
        student = Student.objects.create(name="Alice", student_no="S001")

        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "alice",
                "password": "secret123",
                "role": "STUDENT",
                "name": "Alice",
                "identifier": "S001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        user = User.objects.get(username="alice")
        profile = Profile.objects.get(user=user)
        student.refresh_from_db()

        self.assertEqual(profile.role, "STUDENT")
        self.assertEqual(profile.name, "Alice")
        self.assertEqual(student.user_id, user.id)

    def test_login_and_me_return_profile_data(self):
        user = self._create_student_user("student1")
        login_response = self._login(user.username)

        self.assertEqual(login_response.status_code, 200)
        self.assertIn("access", login_response.data)

        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        me_response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["username"], "student1")
        self.assertEqual(me_response.data["role"], "STUDENT")
        self.assertEqual(me_response.data["name"], "Student One")
        self.assertEqual(me_response.data["major"], "Computer Science")

    def test_login_rejects_invalid_password(self):
        User.objects.create_user(username="wrong-pass-user", password="secret123")

        response = self._login("wrong-pass-user", password="bad-password")

        self.assertEqual(response.status_code, 401)
        self.assertIn("detail", response.data)

    def test_refresh_returns_new_access_token(self):
        user = self._create_student_user("refresh-user")
        login_response = self._login(user.username)

        response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": login_response.data["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_logout_blacklists_refresh_token(self):
        user = self._create_student_user("logout-user")
        login_response = self._login(user.username)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")
        logout_response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": login_response.data["refresh"]},
            format="json",
        )

        self.assertEqual(logout_response.status_code, 200)

        self.client.credentials()
        refresh_response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": login_response.data["refresh"]},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, 401)

    def test_me_rejects_tampered_access_token(self):
        user = self._create_student_user("tamper-user")
        login_response = self._login(user.username)
        access_token = login_response.data["access"]
        header, payload, signature = access_token.split(".")
        tampered_signature = ("A" if signature[0] != "A" else "B") + signature[1:]
        tampered_token = ".".join([header, payload, tampered_signature])

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tampered_token}")
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, 401)
