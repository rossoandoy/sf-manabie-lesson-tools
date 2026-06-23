#!/usr/bin/env python3
"""Discover Manabie Lesson objects via Salesforce CLI."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "extension" / "data" / "discovery-trg2-extuat.json"

INVOICE_BILL_ITEM_OBJECT = "MANAERP__Invoice_Bill_Item__c"
REALLOCATION_OBJECT = "MANAERP__Reallocation__c"

OBJECTS = [
    "MANAERP__Lesson_Schedule__c",
    "MANAERP__Lesson_Schedule_Teacher__c",
    "MANAERP__Lesson_Schedule_Classroom__c",
    "MANAERP__Lesson_Schedule_Class__c",
    "MANAERP__Closed_Date__c",
    "MANAERP__Academic_Calendar_Closed_Dates__c",
    "MANAERP__Location_Course__c",
    "MANAERP__Class__c",
    "MANAERP__Classroom__c",
    "MANAERP__Academic_Year__c",
    "MANAERP__Academic_Calendar__c",
    "Lesson_Slot__c",
    "MANAERP__Lesson__c",
    "MANAERP__Student_Sessions__c",
    INVOICE_BILL_ITEM_OBJECT,
    REALLOCATION_OBJECT,
]

NUMERIC_FIELD_TYPES = frozenset({"double", "int", "currency", "percent"})


LESSON_DISCOVERY_CONFIG = {
    "lessonScheduleObject": "MANAERP__Lesson_Schedule__c",
    "lessonScheduleTeacherObject": "MANAERP__Lesson_Schedule_Teacher__c",
    "lessonScheduleClassroomObject": "MANAERP__Lesson_Schedule_Classroom__c",
    "lessonScheduleClassObject": "MANAERP__Lesson_Schedule_Class__c",
    "closedDateObject": "MANAERP__Closed_Date__c",
    "academicCalendarClosedDateObject": "MANAERP__Academic_Calendar_Closed_Dates__c",
    "locationCourseObject": "MANAERP__Location_Course__c",
    "classObject": "MANAERP__Class__c",
    "classroomObject": "MANAERP__Classroom__c",
    "academicYearObject": "MANAERP__Academic_Year__c",
    "academicCalendarObject": "MANAERP__Academic_Calendar__c",
    "lessonSlotObject": "Lesson_Slot__c",
    "fields": {
        "lessonSchedule": {
            "name": "MANAERP__Lesson_Name__c",
            "location": "MANAERP__Account__c",
            "academicYear": "MANAERP__Academic_Year__c",
            "startDateTime": "MANAERP__Start_Date_Time__c",
            "endDateTime": "MANAERP__End_Date_Time__c",
            "teachingMethod": "MANAERP__Teaching_Method__c",
            "teachingMedium": "MANAERP__Teaching_Medium__c",
            "locationCourse": "MANAERP__Location_Course__c",
            "capacity": "MANAERP__Lesson_Capacity__c",
        },
        "lessonScheduleTeacher": {
            "lessonSchedule": "MANAERP__Lesson_Schedule__c",
            "teacherName": "MANAERP__Teacher_Name__c",
            "teacher": "MANAERP__Teacher__c",
        },
        "lessonScheduleClassroom": {
            "lessonSchedule": "MANAERP__Lesson_Schedule__c",
            "classroom": "MANAERP__Classroom__c",
        },
        "lessonScheduleClass": {
            "lessonSchedule": "MANAERP__Lesson_Schedule__c",
            "classRef": "MANAERP__Class__c",
        },
        "closedDate": {
            "name": "Name",
            "dateTime": "MANAERP__Date_Time__c",
            "academicYear": "MANAERP__Academic_Year__c",
            "academicCalendar": "MANAERP__Academic_Calendar__c",
        },
        "academicCalendarClosedDate": {
            "closedDate": "MANAERP__Closed_Date__c",
            "academicCalendar": "MANAERP__Academic_Calendar__c",
        },
        "lessonSlot": {
            "account": "Account__c",
            "slotKey": "Slot_Key__c",
            "date": "Date__c",
            "period": "Period__c",
            "booth": "Booth__c",
            "studentName": "Student_Name__c",
            "subject": "Subject__c",
            "attendance": "Attendance__c",
            "capacity": "Capacity__c",
            "countTarget": "Count_Target__c",
        },
    },
}


def list_invoice_bill_item_numeric_fields(describe: dict) -> list[dict]:
    """Return custom numeric fields on Invoice Bill Item for F13 paid/billed koma discovery."""
    rows: list[dict] = []
    for field in describe.get("fields", []):
        if field.get("type") not in NUMERIC_FIELD_TYPES:
            continue
        name = field.get("name", "")
        if not name.endswith("__c"):
            continue
        rows.append(
            {
                "apiName": name,
                "label": field.get("label"),
                "type": field.get("type"),
            }
        )
    return sorted(rows, key=lambda row: row["apiName"])


def sf_json(args: list[str]) -> dict:
    result = subprocess.run(["sf", *args, "--json"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)
    return json.loads(result.stdout)


def main() -> int:
    org = sys.argv[1] if len(sys.argv) > 1 else "trg2--extuat"
    org_display = sf_json(["org", "display", "-o", org])
    org_info = org_display.get("result", {})
    described = {}
    for api_name in OBJECTS:
        try:
            described[api_name] = sf_json(["sobject", "describe", "-o", org, "-s", api_name]).get("result", {})
        except RuntimeError as exc:
            described[api_name] = {"error": str(exc)}

    bill_item_describe = described.get(INVOICE_BILL_ITEM_OBJECT, {})
    invoice_bill_item_numeric_fields = (
        list_invoice_bill_item_numeric_fields(bill_item_describe)
        if isinstance(bill_item_describe, dict) and "error" not in bill_item_describe
        else []
    )

    payload = {
        "org": {
            "orgId": org_info.get("id"),
            "username": org_info.get("username"),
            "instanceUrl": org_info.get("instanceUrl"),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "config": LESSON_DISCOVERY_CONFIG,
        "invoiceBillItemNumericFields": invoice_bill_item_numeric_fields,
        "describedObjects": described,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
