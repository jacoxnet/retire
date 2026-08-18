from django.urls import path
from . import views

urlpatterns = [
    path('', views.enter_view, name='enter'),
    path('results/', views.results_view, name='results'),
    path('manage_data/', views.manage_data_view, name='manage_data'),
    path('clear/', views.clear_data_view, name='clear_data'),
    path('load_plan/', views.load_plan_view, name='load_plan'),
    path('change_mode/', views.change_mode_view, name='change_mode'),
    path('api/stress_test/', views.stress_test_api, name='stress_test_api'),
]