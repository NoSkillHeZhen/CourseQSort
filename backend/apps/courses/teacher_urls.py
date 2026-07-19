from django.urls import path

from apps.courses.teacher_views import TeacherScheduleView

urlpatterns = [
    path("schedule/", TeacherScheduleView.as_view(), name="teacher-schedule"),
]
