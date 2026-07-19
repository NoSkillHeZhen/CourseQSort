import json

from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminUser
from apps.common.pagination import PageNumberPagination
from apps.courses.import_export import import_courses_from_json
from apps.courses.models import ClassGroup, Classroom, Course, CourseAssignment, Major, Student, Teacher
from apps.courses.serializers import (
    ClassGroupSerializer,
    ClassroomSerializer,
    CourseAssignmentSerializer,
    CourseCreateSerializer,
    CourseDetailSerializer,
    CourseListSerializer,
    MajorSerializer,
    StudentSerializer,
    TeacherSerializer,
)
from apps.student.models import Enrollment


class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all().order_by("-semester", "name")
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    def get_serializer_class(self):
        if self.action in ("create", "partial_update", "update"):
            return CourseCreateSerializer
        if self.action == "list":
            return CourseListSerializer
        return CourseDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        semester = self.request.query_params.get("semester")
        major = self.request.query_params.get("major")
        keyword = self.request.query_params.get("keyword")
        is_professional = self.request.query_params.get("is_professional")

        if semester:
            qs = qs.filter(semester=semester)
        if major:
            qs = qs.filter(major_id=major)
        if keyword:
            qs = qs.filter(Q(name__icontains=keyword) | Q(code__icontains=keyword))
        if is_professional is not None:
            val = is_professional.lower() in ("true", "1")
            qs = qs.filter(is_professional_course=val)

        return qs.select_related("major").prefetch_related("teachers")

    # ---- 必修课分配 ----

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """批量按专业/年级/班级分配必修课"""
        course = self.get_object()
        major_id = request.data.get("major_id") or None
        grade = request.data.get("grade", "").strip()
        class_group_id = request.data.get("class_group_id") or None
        class_id = request.data.get("class_identification", "").strip()

        if not major_id and not grade and not class_group_id and not class_id:
            return Response({"detail": "至少需要指定专业、年级或班级之一"}, status=status.HTTP_400_BAD_REQUEST)

        # 查找匹配的学生
        student_qs = Student.objects.all()
        if major_id:
            student_qs = student_qs.filter(major_id=int(major_id))
        if grade:
            student_qs = student_qs.filter(grade=grade)
        if class_group_id:
            student_qs = student_qs.filter(class_group_id=int(class_group_id))
        elif class_id:
            student_qs = student_qs.filter(class_identification=class_id)

        # 筛选有绑定用户的学生
        students_with_user = student_qs.exclude(user__isnull=True).select_related("user")

        if not students_with_user.exists():
            return Response({"detail": "没有找到匹配的学生（需要有绑定的用户账号）"}, status=status.HTTP_404_NOT_FOUND)

        # 创建/更新 CourseAssignment 记录
        assignment, created = CourseAssignment.objects.get_or_create(
            course=course,
            major_id=int(major_id) if major_id else None,
            grade=grade,
            class_identification=class_id,
        )

        # 批量创建 Enrollment
        assigned_count = 0
        skipped_count = 0
        with transaction.atomic():
            for student in students_with_user:
                _, enr_created = Enrollment.objects.get_or_create(
                    user=student.user,
                    course=course,
                )
                if enr_created:
                    assigned_count += 1
                else:
                    skipped_count += 1

        return Response(
            {
                "assignment_id": assignment.id,
                "created": created,
                "total_matched": students_with_user.count(),
                "assigned_count": assigned_count,
                "skipped_count": skipped_count,
                "message": f"成功为 {assigned_count} 名学生分配必修课「{course.name}」"
                + (f"（{skipped_count} 名已选）" if skipped_count else ""),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def assignments(self, request, pk=None):
        """查看课程现有的必修分配规则"""
        course = self.get_object()
        qs = CourseAssignment.objects.filter(course=course).select_related("major")
        serializer = CourseAssignmentSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        """导出所有课程为 JSON 格式"""
        from django.http import JsonResponse

        courses = Course.objects.all().prefetch_related("teachers").order_by("id")
        data = []
        for c in courses:
            data.append(
                {
                    "id": c.id,
                    "courseId": c.course_id_from_source,
                    "courseName": c.name,
                    "courseNum": c.code,
                    "credit": c.credit,
                    "hours": c.hours,
                    "semester": c.semester,
                    "campus": c.campus,
                    "major": c.major.name if c.major else "",
                    "teachers": [t.name for t in c.teachers.all()],
                    "is_professional_course": c.is_professional_course,
                    "expected_student_count": c.expected_student_count,
                    "session_length": c.session_length,
                }
            )
        response = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        response["Content-Disposition"] = 'attachment; filename="courses_export.json"'
        return response

    @action(detail=False, methods=["post"])
    def batch_delete(self, request):
        """批量删除指定课程"""
        ids = request.data.get("ids", [])
        if not ids:
            return Response({"detail": "请选择要删除的课程"}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = Course.objects.filter(id__in=ids).delete()
        return Response({"deleted": deleted})

    @action(detail=False, methods=["post"])
    def delete_all(self, request):
        """删除全部课程（需验证密码）"""
        from django.contrib.auth.hashers import check_password

        password = request.data.get("password", "")
        if not password:
            return Response({"detail": "请输入教务密码"}, status=status.HTTP_400_BAD_REQUEST)
        if not check_password(password, request.user.password):
            return Response({"detail": "密码错误"}, status=status.HTTP_403_FORBIDDEN)
        count, _ = Course.objects.all().delete()
        return Response({"deleted": count})


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all().order_by("name")
    serializer_class = TeacherSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        keyword = self.request.query_params.get("keyword")
        if keyword:
            qs = qs.filter(Q(name__icontains=keyword) | Q(employee_no__icontains=keyword))
        return qs

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        teachers = self.get_queryset()
        data = []
        for t in teachers:
            data.append(
                {
                    "name": t.name,
                    "employee_no": t.employee_no,
                    "department": t.department,
                    "unavailable_slots": t.unavailable_slots or [],
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="teachers_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            name = (r.get("name") or "").strip()
            if not name:
                continue
            defaults = {
                "department": r.get("department", ""),
                "unavailable_slots": r.get("unavailable_slots") or [],
            }
            emp_no = (r.get("employee_no") or "").strip()
            if emp_no:
                defaults["employee_no"] = emp_no
            obj, is_new = Teacher.objects.get_or_create(name=name, defaults=defaults)
            if not is_new:
                if emp_no and not obj.employee_no:
                    obj.employee_no = emp_no
                if r.get("department") and not obj.department:
                    obj.department = r["department"]
                obj.save()
            if is_new:
                created += 1
        return Response({"imported": created, "total": len(records)})


class ClassroomViewSet(viewsets.ModelViewSet):
    queryset = Classroom.objects.all().order_by("building", "name")
    serializer_class = ClassroomSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        rooms = self.get_queryset()
        data = []
        for r in rooms:
            data.append(
                {
                    "name": r.name,
                    "capacity": r.capacity,
                    "building": r.building,
                    "is_lab": r.is_lab,
                    "equipment_types": r.equipment_types or [],
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="classrooms_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            name = (r.get("name") or "").strip()
            building = (r.get("building") or "").strip()
            if not name:
                continue
            defaults = {
                "building": building,
                "capacity": r.get("capacity", 60),
                "is_lab": r.get("is_lab", False),
                "equipment_types": r.get("equipment_types") or [],
            }
            obj, is_new = Classroom.objects.get_or_create(name=name, building=building, defaults=defaults)
            if is_new:
                created += 1
        return Response({"imported": created, "total": len(records)})


class MajorViewSet(viewsets.ModelViewSet):
    queryset = Major.objects.all().order_by("name")
    serializer_class = MajorSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        major = self.get_object()
        students = Student.objects.filter(major=major).order_by("student_no")
        page = self.paginate_queryset(students)
        if page is not None:
            serializer = StudentSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = StudentSerializer(students, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def classes(self, request, pk=None):
        """获取某专业下的所有班级"""
        major = self.get_object()
        groups = ClassGroup.objects.filter(major=major).order_by("grade", "name")
        serializer = ClassGroupSerializer(groups, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        majors = self.get_queryset()
        data = []
        for m in majors:
            data.append(
                {
                    "name": m.name,
                    "code": m.code,
                    "student_count": m.student_count,
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="majors_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            name = (r.get("name") or "").strip()
            if not name:
                continue
            obj, is_new = Major.objects.get_or_create(
                name=name,
                defaults={
                    "code": r.get("code", ""),
                    "student_count": r.get("student_count") or None,
                },
            )
            if is_new:
                created += 1
        return Response({"imported": created, "total": len(records)})


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().order_by("grade", "student_no")
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        keyword = self.request.query_params.get("keyword")
        if keyword:
            qs = qs.filter(Q(name__icontains=keyword) | Q(student_no__icontains=keyword))
        return qs.select_related("major", "class_group")

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        students = self.get_queryset()
        data = []
        for s in students:
            data.append(
                {
                    "student_no": s.student_no,
                    "name": s.name,
                    "grade": s.grade,
                    "major_name": s.major.name if s.major else "",
                    "class_identification": s.class_identification,
                    "class_group_name": s.class_group.name if s.class_group else "",
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="students_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            student_no = (r.get("student_no") or "").strip()
            name = (r.get("name") or "").strip()
            if not student_no or not name:
                continue
            # 解析外键
            major = None
            major_name = (r.get("major_name") or "").strip()
            if major_name:
                major = Major.objects.filter(name=major_name).first()
            class_group = None
            cg_name = (r.get("class_group_name") or "").strip()
            if cg_name:
                class_group = ClassGroup.objects.filter(name=cg_name).first()
            defaults = {
                "name": name,
                "grade": r.get("grade", ""),
                "class_identification": r.get("class_identification", ""),
                "major": major,
                "class_group": class_group,
            }
            obj, is_new = Student.objects.get_or_create(student_no=student_no, defaults=defaults)
            if is_new:
                created += 1
            else:
                # 更新外键
                if major and not obj.major:
                    obj.major = major
                if class_group and not obj.class_group:
                    obj.class_group = class_group
                obj.save()
        return Response({"imported": created, "total": len(records)})


class CourseImportView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]
    parser_classes = [MultiPartParser]

    def create(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
        if not file.name.lower().endswith(".json"):
            return Response({"detail": "请上传 JSON 文件（.json）"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session_length_str = request.data.get("session_length", "")
            session_length = int(session_length_str) if session_length_str else None
            result = import_courses_from_json(file, session_length=session_length)
            return Response(result, status=status.HTTP_201_CREATED)
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CourseAssignmentViewSet(viewsets.ModelViewSet):
    """必修课分配规则 CRUD"""

    queryset = CourseAssignment.objects.all().select_related("course", "major")
    serializer_class = CourseAssignmentSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    http_method_names = ["get", "delete", "post"]  # get/delete + import_json

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        assignments = self.get_queryset()
        data = []
        for a in assignments:
            data.append(
                {
                    "course_name": a.course.name if a.course else "",
                    "major_name": a.major.name if a.major else "",
                    "grade": a.grade,
                    "class_identification": a.class_identification,
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="course_assignments_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            course_name = (r.get("course_name") or "").strip()
            major_name = (r.get("major_name") or "").strip()
            if not course_name:
                continue
            course = Course.objects.filter(name=course_name).first()
            major = Major.objects.filter(name=major_name).first() if major_name else None
            if not course:
                continue
            obj, is_new = CourseAssignment.objects.get_or_create(
                course=course,
                major=major,
                grade=r.get("grade", ""),
                class_identification=r.get("class_identification", ""),
            )
            if is_new:
                created += 1
        return Response({"imported": created, "total": len(records)})


class ClassGroupViewSet(viewsets.ModelViewSet):
    """班级 CRUD"""

    queryset = ClassGroup.objects.all().select_related("major").order_by("major", "grade", "name")
    serializer_class = ClassGroupSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    @action(detail=False, methods=["get"])
    def export(self, request):
        from django.http import JsonResponse

        groups = self.get_queryset()
        data = []
        for g in groups:
            data.append(
                {
                    "name": g.name,
                    "grade": g.grade,
                    "major_name": g.major.name if g.major else "",
                }
            )
        resp = JsonResponse(data, safe=False, json_dumps_params={"ensure_ascii": False, "indent": 2})
        resp["Content-Disposition"] = 'attachment; filename="class_groups_export.json"'
        return resp

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_json(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "请上传文件"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            records = json.loads(file.read().decode("utf-8"))
        except json.JSONDecodeError as e:
            return Response({"detail": f"JSON 解析失败: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(records, list):
            records = [records]
        created = 0
        for r in records:
            name = (r.get("name") or "").strip()
            if not name:
                continue
            major_name = (r.get("major_name") or "").strip()
            major = Major.objects.filter(name=major_name).first() if major_name else None
            obj, is_new = ClassGroup.objects.get_or_create(
                name=name, major=major, defaults={"grade": r.get("grade", "")}
            )
            if is_new:
                created += 1
        return Response({"imported": created, "total": len(records)})
