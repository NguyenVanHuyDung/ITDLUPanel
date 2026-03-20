# Request Processing Pipeline

> **Relevant source files**
> * [BTPanel/__init__.py](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py)
> * [BTPanel/app.py](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py)

## Purpose and Scope

This document describes the complete request processing lifecycle in aaPanel, from the moment an HTTP request arrives at the Flask application until a response is returned to the client. It covers all validation stages, security checks, routing mechanisms, module dispatch, and response handling.

**Related Documentation:**

* For authentication mechanisms, see [Authentication and Session Management](/aaPanel/aaPanel/3.1-authentication-and-session-management)
* For security validation details, see [Security and Input Validation](/aaPanel/aaPanel/3.2-security-and-input-validation)
* For CSRF protection implementation, see [CSRF Protection](/aaPanel/aaPanel/3.3-csrf-protection)
* For module routing architecture, see [Module System and Routing](/aaPanel/aaPanel/4-module-system-and-routing)

---

## Request Lifecycle Overview

Every request in aaPanel passes through a multi-stage pipeline that enforces security, validates input, routes to appropriate handlers, and formats responses. The pipeline is implemented using Flask hooks and a custom dispatch system.

```mermaid
sequenceDiagram
  participant Client
  participant Flask
  participant @before_request
  participant request_check()
  participant Route Handler
  participant publicObject
  participant run_exec
  participant Feature Module
  participant @teardown_request

  Client->>Flask: "HTTP Request"
  Flask->>@before_request: "Pre-process request"
  loop ["Request Rejected"]
    @before_request-->>Client: "403/404 Error"
    @before_request->>Route Handler: "Continue to route"
    Route Handler->>publicObject: "Dispatch to module"
    publicObject->>publicObject: "CSRF check"
    publicObject->>publicObject: "Input sanitization"
    publicObject->>run_exec: "Execute method"
    run_exec->>Feature Module: "Call module.action()"
    Feature Module-->>run_exec: "Return result"
    run_exec-->>publicObject: "Format response"
    publicObject-->>Route Handler: "Return response"
    Route Handler-->>Flask: "Response object"
    Flask->>@teardown_request: "Post-process"
    @teardown_request->>@teardown_request: "Log request"
    Flask-->>Client: "HTTP Response"
  end
```

**Sources:** [BTPanel/__init__.py L265-L465](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L265-L465)

---

## Stage 1: Before-Request Processing

The `@app.before_request` decorator registers the `request_check()` function, which executes before every request reaches its route handler. This function implements the first line of defense with multiple validation layers.

### Request Check Function Flow

```mermaid
flowchart TD

Start["request_check()"]
CDN["Get Real IP<br>(CDN proxy handling)"]
MenuFilter["Filter User Menu<br>(non-admin users)"]
MethodCheck["HTTP Method Check<br>(GET, POST, HEAD only)"]
URILen["URI Length Check<br>(max 256 chars)"]
URIPattern["URI Pattern Match<br>(uri_match regex)"]
POSTFilter["POST Parameter Filter<br>(specific routes)"]
SessionIDCheck["Session ID Validation<br>(session_id_match)"]
BasicAuth["Basic Auth<br>Enabled?"]
AuthCheck["Verify Credentials"]
IPCheck["IP Whitelist Check"]
StaticAuth["Static File?"]
RequireAuth["Require Auth"]
DomainCheck["Domain Whitelist Check"]
PathCheck["Protected Path?"]
PasswordExpire["Check Password Expiry"]
Continue["Continue to Route"]
Abort403["abort(403/404)"]
Send401["send_authenticated()"]
ReturnError["Return IP Error"]
Abort401["abort(401)"]

Start --> CDN
CDN --> MenuFilter
MenuFilter --> MethodCheck
MethodCheck --> URILen
URILen --> URIPattern
URIPattern --> POSTFilter
POSTFilter --> SessionIDCheck
SessionIDCheck --> BasicAuth
BasicAuth --> AuthCheck
BasicAuth --> IPCheck
AuthCheck --> IPCheck
IPCheck --> StaticAuth
StaticAuth --> RequireAuth
StaticAuth --> DomainCheck
RequireAuth --> DomainCheck
DomainCheck --> PathCheck
PathCheck --> PasswordExpire
PathCheck --> Continue
PasswordExpire --> Continue
MethodCheck --> Abort403
URILen --> Abort403
URIPattern --> Abort403
SessionIDCheck --> Abort403
AuthCheck --> Send401
IPCheck --> ReturnError
RequireAuth --> Abort401
DomainCheck --> ReturnError
```

**Sources:** [BTPanel/__init__.py L265-L457](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L265-L457)

### Validation Stages

| Stage | Purpose | Rejection Response |
| --- | --- | --- |
| **Real IP Detection** | Extract client IP from headers when behind CDN/proxy | N/A |
| **Menu Filtering** | Redirect non-admin users to their allowed menus | `redirect()` or `abort(403)` |
| **HTTP Method** | Allow only GET, POST, HEAD | `abort(404)` |
| **URI Length** | Prevent buffer overflow attacks (max 256 chars path, 1024 URL) | `abort(403)` |
| **URI Pattern** | Match against `uri_match` regex for valid characters | `abort(403)` |
| **POST Parameters** | Validate parameter keys/values for login-related routes | `abort(403)` |
| **Session ID** | Validate session cookie format with `session_id_match` | `abort(403)` |
| **Basic Auth** | Optional HTTP Basic Authentication layer | `send_authenticated()` (401) |
| **IP Whitelist** | Check if client IP is allowed | IP error response |
| **Static File Auth** | Require authentication for static assets | `abort(401)` |
| **Domain Whitelist** | Validate request domain | Domain error response |
| **Path Protection** | Check for error state and password expiry | `redirect('/error')` or `redirect('/modify_password')` |

**Sources:** [BTPanel/__init__.py L268-L402](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L268-L402)

### Real IP Detection

```

```

The system checks for CloudFlare's `CF-Connecting-IP`, standard `X-Forwarded-For`, or `X-Real-IP` headers to determine the actual client IP when behind a reverse proxy.

**Sources:** [BTPanel/__init__.py L268-L280](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L268-L280)

### URI Validation

Two regex patterns control URI validation:

```

```

* `uri_match`: Validates URI contains only safe characters and valid static file extensions
* `session_id_match`: Ensures session cookie contains only alphanumeric, dots, and dashes

**Sources:** [BTPanel/__init__.py L172-L175](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L172-L175)

 [BTPanel/__init__.py L308-L334](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L308-L334)

### Static File Handling

Static files receive special handling to enforce authentication and resolve relative paths:

```mermaid
flowchart TD

StaticReq["Static File Request"]
CheckPath["Check path contains '/static/'"]
AuthRequired["User<br>Authenticated?"]
Abort401["abort(401)"]
SafetyCheck["Path Safety Check"]
ResolvePlugin["Try Plugin Static<br>/plugin//static/"]
ResolvePanel["Try Panel Static<br>/BTPanel/static/*"]
Exists["File<br>Exists?"]
Abort404["abort(404)"]
SendFile["send_file()"]

StaticReq --> CheckPath
CheckPath --> AuthRequired
AuthRequired --> Abort401
AuthRequired --> SafetyCheck
SafetyCheck --> ResolvePlugin
ResolvePlugin --> ResolvePanel
ResolvePanel --> Exists
Exists --> Abort404
Exists --> SendFile
```

**Sources:** [BTPanel/__init__.py L367-L451](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L367-L451)

---

## Stage 2: Route Matching and Input Parsing

After passing before-request validation, Flask routes the request to the appropriate handler function. Most routes follow a consistent pattern of calling `publicObject()` with a module instance and allowed methods.

### Route Definition Pattern

```

```

Each route handler:

1. Checks local/offline status via `comm.local()`
2. Imports the feature module
3. Instantiates the module class
4. Defines a tuple of allowed method names (`defs`)
5. Calls `publicObject()` to dispatch the request

**Sources:** [BTPanel/__init__.py L855-L976](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L855-L976)

 [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L992-L1009](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L992-L1009)

### Input Parameter Collection

The `get_input()` function consolidates parameters from multiple sources into a single `dict_obj`:

```mermaid
flowchart TD

QueryString["request.args<br>(Query String)"]
FormData["request.form<br>(POST Body)"]
GlobalContext["g.form_data<br>(Flask g object)"]
Merge["Merge into<br>dict_obj"]
Output["Unified data object<br>with dot notation access"]

QueryString --> Merge
FormData --> Merge
GlobalContext --> Merge
Merge --> Output
```

All parameters are converted to strings and stored in a `public.dict_obj` that provides both dictionary and attribute access (e.g., `data['key']` or `data.key`).

**Sources:** [BTPanel/app.py L576-L605](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L576-L605)

---

## Stage 3: Universal Dispatch (publicObject)

The `publicObject()` function serves as a universal dispatcher that enforces security policies before executing any module method. It is the central gateway between routes and feature modules.

### publicObject Function Flow

```mermaid
flowchart TD

Entry["publicObject(toObject, defs, action, get, is_csrf)"]
HasGet["get param<br>provided?"]
GetInput["get = get_input()"]
CheckAction["action<br>provided?"]
SetAction["get.action = action"]
UseExisting["UseExisting"]
CSRFCheck["is_csrf=True AND<br>logged in?"]
ValidateCSRF["check_csrf()"]
Sanitize["Sanitize Inputs:<br>- path<br>- filename<br>- sfile/dfile"]
ReturnErr["Return CSRF Error"]
SiteCheck["Module has<br>site_path_check?"]
CheckSite["toObject.site_path_check(get)"]
RunExec["run_exec().run(toObject, defs, get)"]
ReturnAuth["Return Authority Error"]
Return["Return result"]

Entry --> HasGet
HasGet --> GetInput
HasGet --> CheckAction
GetInput --> CheckAction
CheckAction --> SetAction
CheckAction --> UseExisting
SetAction --> CSRFCheck
UseExisting --> CSRFCheck
CSRFCheck --> ValidateCSRF
CSRFCheck --> Sanitize
ValidateCSRF --> ReturnErr
ValidateCSRF --> Sanitize
Sanitize --> SiteCheck
SiteCheck --> CheckSite
SiteCheck --> RunExec
CheckSite --> ReturnAuth
CheckSite --> RunExec
RunExec --> Return
```

**Sources:** [BTPanel/app.py L342-L376](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L342-L376)

### Input Sanitization

The `publicObject()` function sanitizes common path parameters to prevent directory traversal and XSS attacks:

| Parameter | Sanitization |
| --- | --- |
| `get.path` | Remove `//`, convert `\` to `/`, reject `./`, strip `->` suffix, apply `xssdecode()` |
| `get.filename` | Apply `xssdecode()` |
| `get.sfile` | Remove `//`, convert `\` to `/`, apply `xssdecode()` |
| `get.dfile` | Remove `//`, convert `\` to `/`, apply `xssdecode()` |

**Sources:** [BTPanel/app.py L353-L368](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L353-L368)

### Site Path Boundary Check

For modules that implement `site_path_check()`, this method is called to verify the request doesn't attempt to access files outside allowed site directories:

```

```

This prevents privilege escalation where a user might try to access files belonging to other websites or system directories.

**Sources:** [BTPanel/app.py L370-L373](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L370-L373)

---

## Stage 4: Method Execution (run_exec)

The `run_exec` class handles the actual execution of module methods and response formatting.

### Method Execution Flow

```mermaid
flowchart TD

Start["run_exec.run(toObject, defs, get)"]
Validate["get.action<br>in defs?"]
Error["Return 'Invalid parameters' error"]
Execute["result = getattr(toObject, get.action)(get)"]
CheckHTML["Has 'html' or<br>'s_module' attr?"]
CheckAES["g.is_aes?"]
FormatJSON["Format as JSON:<br>public.GetJson(result)"]
Encrypt["Encrypt with AES:<br>public.aes_encrypt(result, g.aes_key)"]
Return["Return result"]

Start --> Validate
Validate --> Error
Validate --> Execute
Execute --> CheckHTML
CheckHTML --> CheckAES
CheckHTML --> FormatJSON
FormatJSON --> CheckAES
CheckAES --> Encrypt
CheckAES --> Return
Encrypt --> Return
Error --> Return
```

**Sources:** [BTPanel/app.py L312-L330](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L312-L330)

### Allowed Method Whitelist

The `defs` tuple passed to `publicObject()` acts as a whitelist of allowed methods. Only methods in this tuple can be called by clients:

```

```

This prevents attackers from calling internal helper methods or accessing unintended functionality.

**Sources:** [BTPanel/__init__.py L863-L975](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L863-L975)

### Response Type Handling

The `run_exec` class handles multiple response types:

| Response Type | Handling |
| --- | --- |
| `flask.Response` or `werkzeug.Response` | Return directly without modification |
| `dict`, `list`, `str` (when not HTML mode) | Convert to JSON via `public.GetJson()` |
| HTML mode (`get.html` or `get.s_module` set) | Return raw result |
| AES encrypted (`g.is_aes = True`) | Encrypt result with `g.aes_key` |

**Sources:** [BTPanel/app.py L322-L329](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L322-L329)

---

## Stage 5: After-Request Processing

The `@app.teardown_request` decorator registers a function that executes after every request, whether it succeeded or failed.

### Teardown Request Function

```mermaid
flowchart TD

Start["@teardown_request<br>request_end()"]
MethodCheck["Method is<br>GET or POST?"]
End["End"]
NotStatic["Path starts with<br>/static/ or /v2/static/?"]
WriteLog["public.write_request_log()"]
V2Check["Path starts<br>with /v2?"]
ClearSession["g.api_request?"]
SessionTimeout["Check session_timeout"]
NotPlugin["Not /v2/plugin<br>path?"]
CheckReturn["Check g.return_message<br>for specific prefixes"]
Clear["session.clear()"]

Start --> MethodCheck
MethodCheck --> End
MethodCheck --> NotStatic
NotStatic --> WriteLog
NotStatic --> End
WriteLog --> V2Check
V2Check --> ClearSession
V2Check --> SessionTimeout
SessionTimeout --> NotPlugin
NotPlugin --> CheckReturn
NotPlugin --> ClearSession
CheckReturn --> ClearSession
ClearSession --> Clear
ClearSession --> End
Clear --> End
```

**Sources:** [BTPanel/__init__.py L460-L493](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L460-L493)

### Request Logging

Every request (except static files) is logged via `public.write_request_log()`. This creates an audit trail for security and troubleshooting.

**Sources:** [BTPanel/__init__.py L465](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L465-L465)

### V2 API Response Validation

For `/v2` routes, the teardown function checks if the handler used the standardized `public.return_message()` function. This enforces consistent response formatting across the V2 API:

```

```

**Sources:** [BTPanel/__init__.py L468-L489](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L468-L489)

### API Session Cleanup

Requests marked as API calls (`g.api_request = True`) have their sessions cleared after the response to prevent session leakage:

```

```

**Sources:** [BTPanel/__init__.py L490-L492](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L490-L492)

---

## Error Handling

aaPanel implements multiple error handlers for different HTTP status codes and exceptions. All error handlers check authentication status before displaying errors.

### Error Handler Overview

```mermaid
flowchart TD

Request["HTTP Request"]
Error["Error Occurs?"]
H405["@errorhandler(405)"]
H404["@errorhandler(404)"]
H403["@errorhandler(403)"]
H500["@errorhandler(Exception)"]
Success["Normal Response"]
CheckLogin405["Logged In?"]
CheckLogin404["Logged In?"]
CheckLogin403["Logged In?"]
CheckHint["HintException?"]
NotLogin["public.error_not_login()"]
Return405["405 Response<br>(Unified response required)"]
Return404["404 Response<br>(Not Found)"]
Return403["403 Response<br>(Forbidden)"]
ReturnHint["public.fail_v2(str(e))"]
PrintTrace["Print Traceback"]
CheckLogin500["Logged In?"]
ErrorPage["Render panel_error.html<br>with full error details"]
SendReport["Submit error to<br>geterror.aapanel.com"]
Return500["500 Response"]

Request --> Error
Error --> H405
Error --> H404
Error --> H403
Error --> H500
Error --> Success
H405 --> CheckLogin405
H404 --> CheckLogin404
H403 --> CheckLogin403
H500 --> CheckHint
CheckLogin405 --> NotLogin
CheckLogin404 --> NotLogin
CheckLogin403 --> NotLogin
CheckLogin405 --> Return405
CheckLogin404 --> Return404
CheckLogin403 --> Return403
CheckHint --> ReturnHint
CheckHint --> PrintTrace
PrintTrace --> CheckLogin500
CheckLogin500 --> NotLogin
CheckLogin500 --> ErrorPage
ErrorPage --> SendReport
SendReport --> Return500
```

**Sources:** [BTPanel/__init__.py L496-L653](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L496-L653)

### 404 Not Found Handler

```

```

Returns a simple HTML page mimicking nginx's 404 page. If the user is not logged in, redirects to login instead.

**Sources:** [BTPanel/__init__.py L514-L528](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L514-L528)

### 403 Forbidden Handler

Identical structure to 404, but returns 403 status code. Used when access is denied due to insufficient permissions or validation failures.

**Sources:** [BTPanel/__init__.py L532-L546](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L532-L546)

### 405 Method Not Allowed Handler

Special handler for V2 API routes that didn't use the unified response function:

```

```

Note: The error message is in Chinese, requesting use of unified response functions.

**Sources:** [BTPanel/__init__.py L496-L510](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L496-L510)

### 500 Internal Server Error Handler

The most comprehensive error handler, capturing all unhandled exceptions:

```mermaid
flowchart TD

Exception["Exception Raised"]
HintCheck["Is HintException?"]
ReturnHint["Return public.fail_v2(str(e))"]
PrintTrace["Print full traceback"]
LoginCheck["User logged in?"]
NotLogin["public.error_not_login()"]
CollectInfo["Collect error information:<br>- Date/time<br>- Panel version<br>- OS version<br>- Client IP<br>- Request method/URI<br>- Form data (sanitized)<br>- User agent<br>- Full traceback"]
SanitizeForm["Sanitize form data:<br>Hide username, password,<br>phone, keys, certs"]
RenderTemplate["Render panel_error.html<br>with error details"]
CheckCache["Error already<br>reported?"]
SendReport["POST to<br>geterror.aapanel.com"]
Return500["Return 500 Response"]
CacheReport["Cache error ID<br>for 30 minutes"]

Exception --> HintCheck
HintCheck --> ReturnHint
HintCheck --> PrintTrace
PrintTrace --> LoginCheck
LoginCheck --> NotLogin
LoginCheck --> CollectInfo
CollectInfo --> SanitizeForm
SanitizeForm --> RenderTemplate
RenderTemplate --> CheckCache
CheckCache --> SendReport
CheckCache --> Return500
SendReport --> CacheReport
CacheReport --> Return500
```

**Sources:** [BTPanel/__init__.py L550-L653](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L550-L653)

### Error Information Collection

The 500 handler collects comprehensive diagnostic information:

| Field | Source | Sanitization |
| --- | --- | --- |
| REQUEST_DATE | `public.getDate()` | None |
| PANEL_VERSION | `public.version()` | None |
| OS_VERSION | `public.get_os_version()` | None |
| REMOTE_ADDR | `public.GetClientIp()` | None |
| REQUEST_URI | `request.method + request.full_path` | XSS escaped |
| REQUEST_FORM | `request.form.to_dict()` | Passwords/keys masked with `******` |
| USER_AGENT | `request.headers.get('User-Agent')` | XSS escaped |
| ERROR_INFO | Full traceback | None |

**Sources:** [BTPanel/__init__.py L586-L642](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L586-L642)

### Automatic Error Reporting

Errors are automatically submitted to `https://geterror.aapanel.com/bt_error/index.php` for analysis, but only once per unique error ID within 30 minutes to prevent spam:

```

```

**Sources:** [BTPanel/__init__.py L643-L651](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L643-L651)

---

## Request Processing Summary

The complete request pipeline can be summarized in stages:

| Stage | Component | Key Functions | Purpose |
| --- | --- | --- | --- |
| **1. Pre-validation** | `@app.before_request` | `request_check()` | HTTP method, URI, session, auth, IP filtering |
| **2. Route matching** | Flask routing | `@app.route()` decorators | Map URL to handler function |
| **3. Input parsing** | Route handlers | `get_input()` | Consolidate request parameters |
| **4. Universal dispatch** | Security gateway | `publicObject()` | CSRF check, input sanitization, method validation |
| **5. Method execution** | Module executor | `run_exec.run()` | Call module method, format response |
| **6. Post-processing** | `@app.teardown_request` | `request_end()` | Logging, session cleanup, API validation |
| **7. Error handling** | Exception handlers | `@app.errorhandler()` | Standardized error responses, reporting |

### Key Security Checkpoints

Throughout the pipeline, multiple security mechanisms protect against common attacks:

```mermaid
flowchart TD

L1["Layer 1:<br>HTTP Method<br>URI Pattern<br>Length Limits"]
L2["Layer 2:<br>Session Validation<br>Basic Auth<br>IP Whitelist"]
L3["Layer 3:<br>CSRF Token<br>Input Sanitization<br>Path Safety"]
L4["Layer 4:<br>Method Whitelist<br>Site Boundaries<br>Permission Check"]
Request["Client Request"]
Execute["Execute Method"]

Request --> L1
L4 --> Execute

subgraph subGraph0 ["Defense Layers"]
    L1
    L2
    L3
    L4
    L1 --> L2
    L2 --> L3
    L3 --> L4
end
```

Each layer provides defense-in-depth, ensuring that even if one layer is bypassed, multiple other protections remain active.

**Sources:** [BTPanel/__init__.py L265-L457](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L265-L457)

 [BTPanel/app.py L342-L376](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L342-L376)

 [BTPanel/app.py L312-L330](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L312-L330)

---

## Code Entity Reference

### Key Files

| File | Purpose |
| --- | --- |
| `BTPanel/__init__.py` | Main application file with routes, hooks, and error handlers |
| `BTPanel/app.py` | Core application setup and utility functions |
| `class/public.py` | Common utilities for validation, logging, and response formatting |
| `class/common.py` | Contains `panelAdmin` class with `local()` method for route pre-checks |

### Key Functions

| Function | Location | Purpose |
| --- | --- | --- |
| `request_check()` | [BTPanel/__init__.py L266-L457](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L266-L457) | Before-request validation hook |
| `request_end()` | [BTPanel/__init__.py L461-L493](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L461-L493) | After-request logging and cleanup hook |
| `publicObject()` | [BTPanel/app.py L342-L376](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L342-L376) | Universal dispatcher with security enforcement |
| `run_exec.run()` | [BTPanel/app.py L314-L330](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L314-L330) | Module method executor |
| `get_input()` | [BTPanel/app.py L577-L605](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L577-L605) | Request parameter parser |
| `check_csrf()` | [BTPanel/app.py L333-L339](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L333-L339) | CSRF token validator |
| `error_404()`, `error_403()`, `error_405()`, `error_500()` | [BTPanel/__init__.py L496-L653](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L496-L653) | HTTP error handlers |

### Key Variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `uri_match` | [BTPanel/__init__.py L172-L174](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L172-L174) | Regex for valid URI patterns |
| `session_id_match` | [BTPanel/__init__.py L175](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L175-L175) | Regex for valid session IDs |
| `admin_path` | [BTPanel/__init__.py L115-L171](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L115-L171) | Custom admin panel URL path |
| `admin_path_checks` | [BTPanel/__init__.py L118-L169](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L118-L169) | List of protected route prefixes |
| `method_all`, `method_get`, `method_post` | [BTPanel/__init__.py L108-L110](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L108-L110) | Allowed HTTP methods for routes |
| `json_header` | [BTPanel/__init__.py L111](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L111-L111) | JSON response content-type header |

**Sources:** [BTPanel/__init__.py L1-L2891](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L1-L2891)

 [BTPanel/app.py L1-L672](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/app.py#L1-L672)