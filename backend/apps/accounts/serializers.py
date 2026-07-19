from django.contrib.auth import authenticate
from rest_framework import serializers


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    major = serializers.CharField(read_only=True, allow_null=True)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    role = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        user = authenticate(username=attrs.get("username"), password=attrs.get("password"))
        if not user:
            raise serializers.ValidationError("账号或密码错误")
        profile = getattr(user, "profile", None)
        role = (attrs.get("role", "") or "").upper()

        # 如果传了角色参数，校验是否匹配
        if role and profile:
            if profile.role.upper() != role:
                raise serializers.ValidationError("该角色下不存在此账号")

        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(user)

        # 教师/学生附加 id
        teacher_id = None
        student_id = None
        if profile and profile.role == "TEACHER":
            from apps.courses.models import Teacher

            teacher = Teacher.objects.filter(user=user).first()
            if teacher:
                teacher_id = teacher.id
        elif profile and profile.role == "STUDENT":
            from apps.courses.models import Student

            student = Student.objects.filter(user=user).first()
            if student:
                student_id = student.id

        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "username": user.username,
                "role": profile.role if profile else "STUDENT",
                "name": profile.name if profile else user.username,
                "email": user.email,
                "major": profile.major if profile else None,
                "teacher_id": teacher_id,
                "student_id": student_id,
            },
        }


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class RegisterSerializer(serializers.Serializer):
    """注册序列化器 — 学生/教师通过真实姓名绑定数据库记录"""

    username = serializers.CharField(min_length=3, max_length=50)
    password = serializers.CharField(min_length=6, write_only=True)
    role = serializers.ChoiceField(choices=[("STUDENT", "学生"), ("TEACHER", "教师")])
    name = serializers.CharField(min_length=1, max_length=50, help_text="真实姓名")
    # 学生注册需要学号，教师注册需要工号
    identifier = serializers.CharField(min_length=1, max_length=50, help_text="学号（学生）或工号（教师）")

    def validate(self, attrs):
        role = attrs["role"]
        name = attrs["name"]
        identifier = attrs["identifier"]
        from django.contrib.auth.models import User

        # 检查用户名唯一
        if User.objects.filter(username=attrs["username"]).exists():
            raise serializers.ValidationError({"username": "该用户名已被注册"})

        if role == "STUDENT":
            from apps.courses.models import Student

            try:
                student = Student.objects.get(name=name, student_no=identifier)
            except Student.DoesNotExist:
                raise serializers.ValidationError(
                    {
                        "identifier": f"未找到姓名为「{name}」且学号为「{identifier}」的学生记录，请确认信息已由教务录入系统"
                    }
                )
            if student.user is not None:
                raise serializers.ValidationError(
                    {"identifier": f"该学生记录已绑定账号「{student.user.username}」，无法重复注册"}
                )
            attrs["_student"] = student

        elif role == "TEACHER":
            from apps.courses.models import Teacher

            try:
                teacher = Teacher.objects.get(name=name, employee_no=identifier)
            except Teacher.DoesNotExist:
                raise serializers.ValidationError(
                    {
                        "identifier": f"未找到姓名为「{name}」且工号为「{identifier}」的教师记录，请确认信息已由教务录入系统"
                    }
                )
            if teacher.user is not None:
                raise serializers.ValidationError(
                    {"identifier": f"该教师记录已绑定账号「{teacher.user.username}」，无法重复注册"}
                )
            attrs["_teacher"] = teacher

        return attrs

    def create(self, validated_data):
        from django.contrib.auth.models import User

        from apps.accounts.models import Profile

        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )

        role = validated_data["role"]
        name = validated_data["name"]

        Profile.objects.create(
            user=user,
            role=role,
            name=name,
        )

        if role == "STUDENT":
            student = validated_data.get("_student")
            if student:
                student.user = user
                student.save(update_fields=["user"])
        elif role == "TEACHER":
            teacher = validated_data.get("_teacher")
            if teacher:
                teacher.user = user
                teacher.save(update_fields=["user"])

        return user
