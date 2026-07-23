from django.urls import include, path


urlpatterns = [
    path("", include("apps.cases.api.urls")),
]