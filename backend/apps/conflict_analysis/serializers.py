from rest_framework import serializers

from apps.conflict_analysis.models import ConflictAnalysisResult, ConflictPair, ConflictTaskRecord
from apps.courses.models import Course


class NestedCourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name", "code", "hours"]


class RunAnalysisSerializer(serializers.Serializer):
    semester = serializers.CharField()
    course_ids = serializers.ListField(child=serializers.IntegerField())
    threshold = serializers.IntegerField(default=30)


class ConflictTaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConflictTaskRecord
        fields = [
            "task_id",
            "status",
            "progress",
            "analyzed_pairs",
            "total_pairs",
            "conflict_pairs_found",
            "error_message",
        ]


class ConflictResultListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConflictAnalysisResult
        fields = ["id", "semester", "course_count", "conflict_pairs_count", "threshold", "created_at"]


class ConflictPairSerializer(serializers.ModelSerializer):
    course_a = NestedCourseSerializer(read_only=True)
    course_b = NestedCourseSerializer(read_only=True)
    overlapping_slots = serializers.SerializerMethodField()

    class Meta:
        model = ConflictPair
        fields = ["id", "course_a", "course_b", "conflicting_student_count", "conflict_rate", "overlapping_slots"]

    def get_overlapping_slots(self, obj):
        """计算两门课的重叠时段"""
        slots_a = set()
        slots_b = set()
        for item in obj.course_a.schedule_items.all():
            slots_a.add((item.day_of_week, item.period))
        for item in obj.course_b.schedule_items.all():
            slots_b.add((item.day_of_week, item.period))
        overlap = sorted(slots_a & slots_b)
        DAY_NAMES = {1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五"}
        return [{"day": d, "day_name": DAY_NAMES.get(d, "周" + str(d)), "period": p} for d, p in overlap]
