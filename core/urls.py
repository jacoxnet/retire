from django.urls import path
from . import views

urlpatterns = [
    path('', views.enter_view, name='enter'),
    path('results/', views.results_view, name='results'),
]