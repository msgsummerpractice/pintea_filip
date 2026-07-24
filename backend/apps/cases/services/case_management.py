from __future__ import annotations

from django.db import transaction

from apps.cases.models import Case


@transaction.atomic
def delete_case(case: Case) -> str:
    passenger = case.passenger
    case_id = case.case_id
    case.delete()

    if passenger.user_id is None and not passenger.cases.exists():
        passenger.delete()

    return case_id