from django.urls import path

from apps.cases.api.views import AdminUserCreateView
from apps.cases.api.views import AdminUserDeleteView
from apps.cases.api.views import AdminUserListView
from apps.cases.api.views import AirportSearchView
from apps.cases.api.views import AdminCaseDeleteView
from apps.cases.api.views import CaseCreateView
from apps.cases.api.views import ChangePasswordView
from apps.cases.api.views import CsrfTokenView
from apps.cases.api.views import CompensationCalculateView
from apps.cases.api.views import LoginView
from apps.cases.api.views import LogoutView
from apps.cases.api.views import SessionView


urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/session/", SessionView.as_view(), name="auth-session"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("csrf/", CsrfTokenView.as_view(), name="csrf-token"),
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("users/create/", AdminUserCreateView.as_view(), name="admin-user-create"),
    path("users/<int:user_id>/", AdminUserDeleteView.as_view(), name="admin-user-delete"),
    path("airports/search", AirportSearchView.as_view(), name="airport-search"),
    path("cases/", CaseCreateView.as_view(), name="case-create"),
    path("cases/<str:case_id>/", AdminCaseDeleteView.as_view(), name="admin-case-delete"),
    path("compensation/calculate", CompensationCalculateView.as_view(), name="compensation-calculate"),
]