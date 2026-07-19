from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminUser
from apps.common.pagination import PageNumberPagination
from apps.conflict_analysis.models import ConflictAnalysisResult, ConflictTaskRecord
from apps.conflict_analysis.serializers import (
    ConflictPairSerializer,
    ConflictResultListSerializer,
    ConflictTaskStatusSerializer,
    RunAnalysisSerializer,
)


class RunAnalysisView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def create(self, request):
        serializer = RunAnalysisSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        result = ConflictAnalysisResult.objects.create(
            semester=serializer.validated_data["semester"],
            course_count=len(serializer.validated_data["course_ids"]),
            threshold=serializer.validated_data["threshold"],
        )

        task = ConflictTaskRecord.objects.create(
            result=result,
            status="PENDING",
        )

        # 异步线程执行，立即返回给前端轮询
        import threading

        from apps.conflict_analysis.tasks import run_analysis_sync

        task_id = str(task.task_id)
        thread = threading.Thread(target=run_analysis_sync, args=(task_id,), daemon=True)
        thread.start()

        return Response(
            {
                "task_id": str(task.task_id),
                "status": task.status,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class TaskStatusView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def retrieve(self, request, pk=None):
        try:
            task = ConflictTaskRecord.objects.get(task_id=pk)
        except ConflictTaskRecord.DoesNotExist:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ConflictTaskStatusSerializer(task)
        return Response(serializer.data)


class ResultViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ConflictAnalysisResult.objects.all()
    permission_classes = [IsAuthenticated, IsAdminUser]
    pagination_class = PageNumberPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ConflictResultListSerializer
        return ConflictResultListSerializer

    @action(detail=True, methods=["get"])
    def pairs(self, request, pk=None):
        result = self.get_object()
        qs = result.pairs.all()
        threshold = request.query_params.get("threshold")
        if threshold:
            try:
                qs = qs.filter(conflicting_student_count__gte=int(threshold))
            except ValueError:
                pass
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ConflictPairSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = ConflictPairSerializer(qs, many=True)
        return Response(serializer.data)
