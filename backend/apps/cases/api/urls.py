from django.urls import path

from apps.cases.api.views import AdminUserListView
from apps.cases.api.views import AirportSearchView
from apps.cases.api.views import CaseCreateView
from apps.cases.api.views import CompensationCalculateView


urlpatterns = [
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("airports/search", AirportSearchView.as_view(), name="airport-search"),
    path("cases/", CaseCreateView.as_view(), name="case-create"),
    path("compensation/calculate", CompensationCalculateView.as_view(), name="compensation-calculate"),
]