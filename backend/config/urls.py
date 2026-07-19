from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/admin/", include("apps.courses.urls")),
    path("api/v1/admin/", include("apps.protected_slots.urls")),
    path("api/v1/admin/", include("apps.scheduling.urls")),
    path("api/v1/admin/", include("apps.conflict_analysis.urls")),
    path("api/v1/admin/", include("apps.algorithm_config.urls")),
    path("api/v1/student/", include("apps.student.urls")),
    path("api/v1/teacher/", include("apps.courses.teacher_urls")),
]
