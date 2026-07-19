from django.core.management.base import BaseCommand

from apps.courses.import_export import _extract_entities, _load_json_data, _persist_entities


class Command(BaseCommand):
    help = "Import course data from crawled JSON file (test_100.json format)"

    def add_arguments(self, parser):
        parser.add_argument("json_file", type=str, help="Path to the JSON file")
        parser.add_argument("--semester", type=str, default=None, help="Override semester (e.g. 2025-2)")
        parser.add_argument("--dry-run", action="store_true", help="Preview only, no database writes")

    def handle(self, *args, **options):
        json_file = options["json_file"]
        dry_run = options["dry_run"]
        semester_override = options["semester"]

        records = _load_json_data(json_file)
        self.stdout.write(f"Loaded {len(records)} records from {json_file}")

        entities = _extract_entities(records, semester_override)

        if dry_run:
            self._print_dry_run(entities)
            return

        stats = _persist_entities(entities)

        self.stdout.write(
            self.style.SUCCESS(
                f'Import complete: {stats["course_count"]} courses, '
                f'{stats["teacher_count"]} teachers, '
                f'{stats["classroom_count"]} classrooms, '
                f'{stats["schedule_count"]} schedule items'
            )
        )

    # ── Dry-run 预览 ───────────────────────────────────────────

    def _print_dry_run(self, entities):
        self.stdout.write(self.style.WARNING("--- DRY RUN (no data written) ---"))
        self.stdout.write(f'\nMajors ({len(entities["majors"])}):')
        for name, dept in entities["majors"]:
            self.stdout.write(f"  {name} ({dept})")
        self.stdout.write(f'\nTeachers ({len(entities["teachers"])}):')
        for name, data in entities["teachers"].items():
            self.stdout.write(f'  {name} ({data["department"]})')
        self.stdout.write(f'\nClassrooms ({len(entities["classrooms"])}):')
        for bld, name in entities["classrooms"]:
            self.stdout.write(f"  {bld}-{name}")
        self.stdout.write(f'\nCourses ({len(entities["courses"])}):')
        for cid, c in entities["courses"].items():
            teachers_str = ", ".join(sorted(c["teacher_names"])) if c["teacher_names"] else "(no teacher)"
            self.stdout.write(f'  {c["name"]} ({c["code"]}) [{c["semester"]}] ' f'校区={c["campus"]} — {teachers_str}')
        self.stdout.write(f'\nSchedule items: {len(entities["schedule_items"])}')
        self.stdout.write(self.style.WARNING("--- END DRY RUN ---"))
