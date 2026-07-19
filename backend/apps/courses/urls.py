from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.courses.views import (
    ClassGroupViewSet,
    ClassroomViewSet,
    CourseAssignmentViewSet,
    CourseImportView,
    CourseViewSet,
    MajorViewSet,
    StudentViewSet,
    TeacherViewSet,
)

router = DefaultRouter()
router.register(r"courses", CourseViewSet, basename="course")
router.register(r"teachers", TeacherViewSet, basename="teacher")
router.register(r"classrooms", ClassroomViewSet, basename="classroom")
router.register(r"majors", MajorViewSet, basename="major")
router.register(r"students", StudentViewSet, basename="student")
router.register(r"course-assignments", CourseAssignmentViewSet, basename="course-assignment")
router.register(r"class-groups", ClassGroupViewSet, basename="class-group")

urlpatterns = [
    path("courses/import/", CourseImportView.as_view({"post": "create"}), name="course-import"),
    path("", include(router.urls)),
]
