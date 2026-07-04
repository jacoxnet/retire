from django.db import models

class SimulationData(models.Model):
    goal_seeking = models.BooleanField(default=False)
    initial_wealth = models.DecimalField(max_digits=10, decimal_places=2, default=100000)
    annual_return = models.DecimalField(max_digits=5, decimal_places=2, default=6)
    return_std = models.DecimalField(max_digits=5, decimal_places=2, default=12)
    annual_withdrawal = models.DecimalField(max_digits=10, decimal_places=2, default=10000)
    inflation_rate = models.DecimalField(max_digits=5, decimal_places=2, default=2.5)
    inflation_std = models.DecimalField(max_digits=5, decimal_places=2, default=2.5)
    years = models.IntegerField(default=30)
    runs = models.IntegerField(default=100)
    target_success_rate = models.DecimalField(max_digits=5, decimal_places=2, default=80)
    
    def to_dict(self):
        return {
            'goal_seeking': self.goal_seeking,
            'initial_wealth': self.initial_wealth,
            'annual_return': self.annual_return,
            'return_std': self.return_std,
            'annual_withdrawal': self.annual_withdrawal,
            'inflation_rate': self.inflation_rate,
            'inflation_std': self.inflation_std,
            'years': self.years,
            'runs': self.runs,
            'target_success_rate': self.target_success_rate,
        }

    def __str__(self):
        return str(self.to_dict())