import pytest

from apps.cases.models import Case, CaseStatus, Disruption, DisruptionType, Passenger


@pytest.mark.django_db
class TestDisruptionModel:
    @pytest.fixture
    def case_with_passenger(self):
        passenger = Passenger.objects.create(
            first_name="Test",
            last_name="User",
            date_of_birth="1990-01-01",
            email="test@example.com",
            phone="+1234567890",
            address="123 Test St",
            postal_code="12345",
        )
        return Case.objects.create(
            passenger=passenger,
            reservation_number="ABC123",
            status=CaseStatus.NEW,
            gdpr_consent_primary=True,
            gdpr_consent_secondary=True,
        )

    def test_create_cancellation_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.CANCELLATION,
            cancellation_notice_timing="<14 days",
            airline_motive_known="yes",
            airline_motive="technical_problem",
            incident_description="Flight was cancelled without proper notice.",
        )
        assert disruption.disruption_type == "CANCELLATION"
        assert disruption.cancellation_notice_timing == "<14 days"
        assert disruption.airline_motive_known == "yes"
        assert disruption.airline_motive == "technical_problem"

    def test_create_delay_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.DELAY,
            delay_arrival_outcome=">3h",
            airline_motive_known="no",
            incident_description="Arrived 5 hours late.",
        )
        assert disruption.delay_arrival_outcome == ">3h"
        assert disruption.airline_motive_known == "no"

    def test_create_denied_boarding_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.DENIED_BOARDING,
            gave_up_seat_voluntarily="no",
            denied_boarding_reason="flight_overbooked",
            incident_description="Was denied boarding despite valid ticket.",
        )
        assert disruption.gave_up_seat_voluntarily == "no"
        assert disruption.denied_boarding_reason == "flight_overbooked"

    def test_incident_description_required(self, case_with_passenger):
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            Disruption.objects.create(
                case=case_with_passenger,
                disruption_type=DisruptionType.CANCELLATION,
                incident_description=None,
            )
