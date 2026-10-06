from django.conf import settings


class ServerRunSessionResetMiddleware:
    """Discard session data left over from a previous server run.

    Sessions live in the database and the browser keeps its session cookie,
    so without this a restarted app would show the prior run's plan instead
    of the default data.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.session.get('server_run_id') != settings.SERVER_RUN_ID:
            request.session.clear()
            request.session['server_run_id'] = settings.SERVER_RUN_ID
        return self.get_response(request)
