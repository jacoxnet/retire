// Safe HTML helpers and delegated event dispatcher.
//
// The Content-Security-Policy forbids inline event handlers (onclick="..."),
// so markup declares handlers as data attributes instead:
//
//   data-on-click='["fnName", "arg1", 2, "$el"]'
//
// The first array entry names a global function; the rest are its arguments.
// Special tokens: "$el" -> the element, "$value" -> el.value, "$checked" -> el.checked.
// data-stop-click (etc.) stops the dispatcher from also firing ancestor handlers.
// <form data-confirm="message"> asks for confirmation before submitting.

// Escape a value for safe insertion into HTML text or a quoted attribute
function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Template-literal tag that escapes every interpolated value: safeHtml`<b>${name}</b>`
function safeHtml(strings) {
    var out = strings[0];
    for (var i = 1; i < strings.length; i++) {
        out += escapeHtml(arguments[i]) + strings[i];
    }
    return out;
}

// Build a data-on-<event> attribute string for use in generated HTML
function actionAttr(eventName, fnName) {
    var args = Array.prototype.slice.call(arguments, 2);
    return 'data-on-' + eventName + '="' + escapeHtml(JSON.stringify([fnName].concat(args))) + '"';
}

(function () {
    function resolveArg(arg, el) {
        if (arg === '$el') return el;
        if (arg === '$value') return el.value;
        if (arg === '$checked') return el.checked;
        return arg;
    }

    function dispatch(e, name) {
        var attr = 'data-on-' + name;
        var stopAttr = 'data-stop-' + name;
        for (var el = e.target; el && el.nodeType === 1; el = el.parentElement) {
            var spec = el.getAttribute(attr);
            if (spec) {
                var parts;
                try {
                    parts = JSON.parse(spec);
                } catch (err) {
                    console.error('Invalid ' + attr + ' attribute:', spec);
                    parts = null;
                }
                if (Array.isArray(parts) && typeof parts[0] === 'string' && typeof window[parts[0]] === 'function') {
                    window[parts[0]].apply(el, parts.slice(1).map(function (a) { return resolveArg(a, el); }));
                } else if (parts) {
                    console.error('Unknown handler in ' + attr + ':', spec);
                }
            }
            if (el.hasAttribute(stopAttr)) break;
        }
    }

    ['click', 'input', 'change'].forEach(function (name) {
        document.addEventListener(name, function (e) { dispatch(e, name); });
    });

    // blur does not bubble; focusout does and fires at the same moment
    document.addEventListener('focusout', function (e) { dispatch(e, 'blur'); });

    document.addEventListener('submit', function (e) {
        var form = e.target;
        var msg = form && form.getAttribute && form.getAttribute('data-confirm');
        if (msg && !window.confirm(msg)) {
            e.preventDefault();
            return;
        }
        dispatch(e, 'submit');
    });
})();
