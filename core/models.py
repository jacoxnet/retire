from django.db import models

class SimulationData(models.Model):
    data = models.JSONField(default=dict)
    
    def to_dict(self):
        return self.data or {}

    def __str__(self):
        return str(self.to_dict())