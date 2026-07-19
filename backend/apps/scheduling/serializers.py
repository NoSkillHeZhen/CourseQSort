from rest_framework import serializers

from apps.courses.models import Classroom, Course, Teacher
from apps.scheduling.models import ScheduleEntry, SchedulePlan, TaskRecord


class NestedCourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name"]


class NestedTeacherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Teacher
        fields = ["id", "name"]


class NestedClassroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = ["id", "name"]


class ScheduleEntrySerializer(serializers.ModelSerializer):
    course = NestedCourseSerializer(read_only=True)
    teacher = NestedTeacherSerializer(read_only=True)
    classroom = NestedClassroomSerializer(read_only=True)

    class Meta:
        model = ScheduleEntry
        fields = ["id", "course", "teacher", "classroom", "day_of_week", "period", "week", "student_group_ids"]


class SchedulePlanListSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = SchedulePlan
        fields = ["id", "plan_name", "semester", "major_ids", "overall_fitness", "status", "created_at", "created_by"]

    def get_created_by(self, obj):
        if obj.created_by:
            profile = getattr(obj.created_by, "profile", None)
            return profile.name if profile else obj.created_by.username
        return None


class SchedulePlanDetailSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    entries = ScheduleEntrySerializer(many=True, read_only=True)

    class Meta:
        model = SchedulePlan
        fields = [
            "id",
            "plan_name",
            "semester",
            "major_ids",
            "overall_fitness",
            "status",
            "algorithm_config",
            "created_at",
            "created_by",
            "entries",
        ]

    def get_created_by(self, obj):
        if obj.created_by:
            profile = getattr(obj.created_by, "profile", None)
            return profile.name if profile else obj.created_by.username
        return None


class GenerateSerializer(serializers.Serializer):
    plan_name = serializers.CharField()
    semester = serializers.CharField()
    major_ids = serializers.ListField(child=serializers.IntegerField())
    algorithm_config = serializers.JSONField(required=False, default=dict)


class TaskStatusSerializer(serializers.ModelSerializer):
    total_entries = serializers.SerializerMethodField()

    class Meta:
        model = TaskRecord
        fields = [
            "task_id",
            "status",
            "progress",
            "current_generation",
            "best_fitness",
            "estimated_time_remaining",
            "error_message",
            "total_entries",
        ]

    def get_total_entries(self, obj):
        if obj.plan and obj.status == "SUCCESS":
            return obj.plan.entries.count()
        return 0


class OverrideSerializer(serializers.Serializer):
    course_id = serializers.IntegerField()
    day_of_week = serializers.IntegerField()
    period = serializers.IntegerField()
    classroom_id = serializers.IntegerField(required=False)
    teacher_id = serializers.IntegerField(required=False)
    reason = serializers.CharField(required=False, default="")


class PublishSerializer(serializers.Serializer):
    pass
