import uuid

from rest_framework import serializers

from apps.courses.models import ClassGroup, Classroom, Course, CourseAssignment, Major, Student, Teacher


class MajorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Major
        fields = ["id", "name", "code", "student_count"]


class TeacherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Teacher
        fields = ["id", "name", "employee_no", "department", "unavailable_slots"]


class ClassroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = ["id", "name", "capacity", "building", "equipment_types", "is_lab"]


class StudentSerializer(serializers.ModelSerializer):
    major_name = serializers.SerializerMethodField(read_only=True)
    class_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = [
            "id",
            "student_no",
            "name",
            "major",
            "major_name",
            "grade",
            "class_identification",
            "class_group",
            "class_name",
        ]

    def get_major_name(self, obj):
        return obj.major.name if obj.major else ""

    def get_class_name(self, obj):
        return obj.class_group.name if obj.class_group else (obj.class_identification or "")


class ClassGroupSerializer(serializers.ModelSerializer):
    major_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ClassGroup
        fields = ["id", "name", "major", "major_name", "grade"]

    def get_major_name(self, obj):
        return obj.major.name if obj.major else ""


class NestedMajorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Major
        fields = ["id", "name"]


class NestedTeacherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Teacher
        fields = ["id", "name"]


class CourseListSerializer(serializers.ModelSerializer):
    major = NestedMajorSerializer(read_only=True)
    teachers = NestedTeacherSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "name",
            "code",
            "credit",
            "hours",
            "major",
            "teachers",
            "required_classroom_types",
            "expected_student_count",
            "is_professional_course",
            "session_length",
        ]


class CourseAssignmentSerializer(serializers.ModelSerializer):
    major_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CourseAssignment
        fields = ["id", "course", "major", "major_name", "grade", "class_identification", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_major_name(self, obj):
        return obj.major.name if obj.major else ""


class CourseDetailSerializer(serializers.ModelSerializer):
    major = NestedMajorSerializer(read_only=True)
    teachers = NestedTeacherSerializer(many=True, read_only=True)
    assignments = CourseAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "name",
            "code",
            "credit",
            "hours",
            "major",
            "teachers",
            "required_classroom_types",
            "expected_student_count",
            "is_professional_course",
            "prerequisites",
            "semester",
            "created_at",
            "session_length",
            "assignments",
        ]


class CourseCreateSerializer(serializers.ModelSerializer):
    major_id = serializers.IntegerField(required=False, allow_null=True)
    teacher_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)

    class Meta:
        model = Course
        fields = [
            "name",
            "code",
            "credit",
            "hours",
            "semester",
            "major_id",
            "teacher_ids",
            "required_classroom_types",
            "expected_student_count",
            "is_professional_course",
            "session_length",
        ]

    def create(self, validated_data):
        teacher_ids = validated_data.pop("teacher_ids", [])
        major_id = validated_data.pop("major_id", None)
        if major_id:
            validated_data["major_id"] = major_id
        # 自动生成唯一 course_id_from_source（手动创建课程的前缀为 manual-）
        validated_data["course_id_from_source"] = f"manual-{uuid.uuid4().hex[:12]}"
        course = Course.objects.create(**validated_data)
        if teacher_ids:
            course.teachers.set(Teacher.objects.filter(id__in=teacher_ids))
        return course

    def update(self, instance, validated_data):
        teacher_ids = validated_data.pop("teacher_ids", None)
        major_id = validated_data.pop("major_id", None)
        if major_id is not None:
            instance.major_id = major_id
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if teacher_ids is not None:
            instance.teachers.set(Teacher.objects.filter(id__in=teacher_ids))
        return instance
