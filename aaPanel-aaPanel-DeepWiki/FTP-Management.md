# FTP Management

> **Relevant source files**
> * [BTPanel/__init__.py](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py)

## Purpose and Scope

The FTP Management module provides a web-based interface for managing FTP accounts and permissions in aaPanel. This module handles FTP user creation, deletion, password management, home directory configuration, and activity logging. It interfaces with the Pure-FTPd service to provide secure FTP access to server resources.

For website-specific FTP access configuration, see [Website Management](/aaPanel/aaPanel/5.1-website-management). For file operations and management, see the Files module documentation.

## Architecture Overview

The FTP management system follows aaPanel's standard module architecture with dual API versions and a clear separation between routing, business logic, and system configuration.

```mermaid
flowchart TD

V1Route["/ftp<br>Base Route"]
V2Route["/v2/ftp<br>V2 Route"]
PublicObject["publicObject()<br>Universal Dispatcher"]
CSRF["CSRF Validation"]
FtpV1["class/ftp.py<br>ftp.ftp()"]
FtpV2["class_v2/ftp_v2.py<br>ftp_v2.ftp()"]
AddUser["AddUser()"]
DeleteUser["DeleteUser()"]
SetPassword["SetUserPassword()"]
SetStatus["SetStatus()"]
SetPort["setPort()"]
SetHome["set_user_home()"]
GetLoginLogs["get_login_logs()"]
GetActionLogs["get_action_logs()"]
SetLogs["set_ftp_logs()"]
PureFTPd["Pure-FTPd Service<br>/www/server/pure-ftpd"]
FtpConfig["FTP Configuration<br>pure-ftpd.conf"]
Database["SQLite Database<br>ftps table"]

V1Route --> PublicObject
V2Route --> PublicObject
CSRF --> FtpV1
CSRF --> FtpV2
FtpV1 --> AddUser
FtpV1 --> DeleteUser
FtpV1 --> SetPassword
FtpV1 --> SetStatus
FtpV1 --> SetPort
FtpV1 --> SetHome
FtpV1 --> GetLoginLogs
FtpV1 --> GetActionLogs
FtpV1 --> SetLogs
FtpV2 --> AddUser
FtpV2 --> DeleteUser
FtpV2 --> SetPassword
AddUser --> PureFTPd
DeleteUser --> PureFTPd
SetPassword --> PureFTPd
SetPort --> FtpConfig
AddUser --> Database
DeleteUser --> Database
SetPassword --> Database

subgraph subGraph4 ["System Integration"]
    PureFTPd
    FtpConfig
    Database
end

subgraph subGraph3 ["FTP Operations"]
    AddUser
    DeleteUser
    SetPassword
    SetStatus
    SetPort
    SetHome
    GetLoginLogs
    GetActionLogs
    SetLogs
end

subgraph subGraph2 ["Business Logic"]
    FtpV1
    FtpV2
end

subgraph subGraph1 ["Dispatch Layer"]
    PublicObject
    CSRF
    PublicObject --> CSRF
end

subgraph subGraph0 ["Route Layer"]
    V1Route
    V2Route
end
```

**Sources:** [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L3798-L3819](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3798-L3819)

 [BTPanel/__init__.py L2762-L2774](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2762-L2774)

## Route Handlers

The FTP module is accessible through two primary routes that follow aaPanel's dual API architecture:

### Base Route (V1)

```mermaid
flowchart TD

Request["POST /ftp"]
LocalCheck["comm.local()<br>Authentication"]
Import["import ftp"]
CreateObject["ftpObject = ftp.ftp()"]
DefList["defs tuple<br>9 methods"]
Dispatch["publicObject(ftpObject, defs)"]
Response["JSON Response"]

Request --> LocalCheck
LocalCheck --> Import
Import --> CreateObject
CreateObject --> DefList
DefList --> Dispatch
Dispatch --> Response
```

The base route handler is defined at [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

:

* **Route:** `/ftp`
* **Method:** POST only
* **Authentication:** Required via `comm.local()`
* **Module:** `class/ftp.py`

### V2 Route

The V2 route handler is defined at [BTPanel/__init__.py L3798-L3819](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3798-L3819)

:

* **Route:** `/v2/ftp`
* **Methods:** GET (for page rendering) and POST (for operations)
* **Authentication:** Required via `comm.local()`
* **Module:** `class_v2/ftp_v2.py`

The V2 route includes template rendering logic when accessed via GET:

* Calls `FtpPort()` to retrieve FTP port configuration
* Checks if Pure-FTPd is installed at setup path
* Renders `ftp.html` template with system configuration data

**Sources:** [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L3798-L3819](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3798-L3819)

 [BTPanel/__init__.py L767-L776](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L767-L776)

## FTP Module Operations

Both FTP module versions expose the same set of operations through the `publicObject` dispatcher pattern:

| Operation | Purpose | Parameters |
| --- | --- | --- |
| `AddUser` | Create new FTP account | username, password, path, permissions |
| `DeleteUser` | Remove FTP account | username |
| `SetUserPassword` | Change user password | username, new password |
| `SetStatus` | Enable/disable account | username, status |
| `setPort` | Configure FTP port | port number |
| `set_user_home` | Modify home directory | username, path |
| `get_login_logs` | Retrieve login history | filters, pagination |
| `get_action_logs` | Retrieve action history | filters, pagination |
| `set_ftp_logs` | Configure logging | log settings |

```mermaid
flowchart TD

AddUser["AddUser()<br>Create FTP Account"]
DeleteUser["DeleteUser()<br>Remove Account"]
SetPassword["SetUserPassword()<br>Update Password"]
SetStatus["SetStatus()<br>Enable/Disable"]
SetPort["setPort()<br>Change FTP Port"]
SetHome["set_user_home()<br>Set Home Directory"]
SetLogs["set_ftp_logs()<br>Configure Logging"]
GetLoginLogs["get_login_logs()<br>Login History"]
GetActionLogs["get_action_logs()<br>Action History"]
FtpsTable["ftps table<br>Account Storage"]
PureFTPd["Pure-FTPd<br>FTP Server"]

AddUser --> FtpsTable
AddUser --> PureFTPd
DeleteUser --> FtpsTable
DeleteUser --> PureFTPd
SetPassword --> FtpsTable
SetPassword --> PureFTPd
SetStatus --> FtpsTable
SetHome --> FtpsTable
SetPort --> PureFTPd
SetLogs --> PureFTPd
GetLoginLogs --> PureFTPd
GetActionLogs --> PureFTPd

subgraph subGraph4 ["Service Layer"]
    PureFTPd
end

subgraph subGraph3 ["Database Layer"]
    FtpsTable
end

subgraph Monitoring ["Monitoring"]
    GetLoginLogs
    GetActionLogs
end

subgraph Configuration ["Configuration"]
    SetPort
    SetHome
    SetLogs
end

subgraph subGraph0 ["User Management"]
    AddUser
    DeleteUser
    SetPassword
    SetStatus
end
```

**Sources:** [BTPanel/__init__.py L986-L988](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L986-L988)

 [BTPanel/__init__.py L3816-L3818](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3816-L3818)

## Request Processing Flow

The FTP module follows aaPanel's standard request processing pipeline with security enforcement at multiple layers:

```mermaid
sequenceDiagram
  participant Client
  participant /ftp Route
  participant comm.local()
  participant publicObject()
  participant check_csrf()
  participant ftp.ftp()
  participant Pure-FTPd
  participant SQLite DB

  Client->>/ftp Route: POST /ftp?action=AddUser
  /ftp Route->>comm.local(): Verify authentication
  loop [CSRF invalid]
    comm.local()-->>Client: Redirect to login
    comm.local()->>/ftp Route: Continue
    /ftp Route->>publicObject(): Dispatch request
    publicObject()->>check_csrf(): Validate CSRF token
    check_csrf()-->>Client: CSRF_ERR
    check_csrf()->>publicObject(): Continue
    publicObject()->>ftp.ftp(): ftpObject.AddUser(get)
    ftp.ftp()->>SQLite DB: Insert FTP account
    ftp.ftp()->>Pure-FTPd: Create system user
    Pure-FTPd-->>ftp.ftp(): Success
    ftp.ftp()-->>publicObject(): Operation result
    publicObject()-->>Client: JSON response
  end
```

### Security Validation

The FTP module benefits from multiple security layers enforced by the framework:

1. **Authentication Check** - `comm.local()` verifies user is logged in [BTPanel/__init__.py L982](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L982-L982)
2. **CSRF Protection** - Token validation via `check_csrf()` [BTPanel/__init__.py L2688-L2694](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2688-L2694)
3. **Input Sanitization** - Path validation in `publicObject()` [BTPanel/__init__.py L2708-L2723](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2708-L2723)
4. **Site Path Check** - Prevents directory traversal [BTPanel/__init__.py L2725-L2728](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2725-L2728)

**Sources:** [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L2697-L2731](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2697-L2731)

 [BTPanel/__init__.py L2688-L2694](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2688-L2694)

## Port Configuration

The FTP port is managed through the Pure-FTPd configuration file and retrieved via the `FtpPort()` function:

```mermaid
flowchart TD

FtpPort["FtpPort()<br>Port Retrieval"]
ConfigFile["pure-ftpd.conf<br>/www/server/pure-ftpd/etc/"]
Regex["Regex Pattern<br>Bind IP,PORT"]
Session["session['port']<br>Cache Port Value"]

FtpPort --> ConfigFile
ConfigFile --> Regex
Regex --> Session
```

The `FtpPort()` function [BTPanel/__init__.py L2762-L2774](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2762-L2774)

:

* Reads from `/www/server/pure-ftpd/etc/pure-ftpd.conf`
* Uses regex pattern `\n#?\s*Bind\s+[0-9]+\.[0-9]+\.[0-9]+\.+[0-9]+,([0-9]+)` to extract port
* Defaults to port `21` if not found
* Caches result in `session['port']` for performance

**Sources:** [BTPanel/__init__.py L2762-L2774](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2762-L2774)

## Page Rendering

When accessed via GET, the V2 FTP route renders the management interface:

```mermaid
flowchart TD

GetRequest["GET /v2/ftp"]
FtpPort["FtpPort()<br>Load Port Config"]
SystemInfo["system_v2.GetConcifInfo()<br>System Data"]
CheckSetup["Check Pure-FTPd<br>Installation"]
LoadLan["GetLan('ftp')<br>Localization"]
Template["render_template('ftp.html')"]
IsSetup["data['isSetup'] = True"]
NotSetup["data['isSetup'] = False"]

GetRequest --> FtpPort
FtpPort --> SystemInfo
SystemInfo --> CheckSetup
CheckSetup --> LoadLan
LoadLan --> Template
CheckSetup --> IsSetup
CheckSetup --> NotSetup
IsSetup --> Template
NotSetup --> Template
```

The page rendering logic [BTPanel/__init__.py L3803-L3813](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3803-L3813)

:

* Invokes `FtpPort()` to populate session with port configuration
* Calls `system_v2.system().GetConcifInfo()` for system metadata
* Checks for Pure-FTPd installation at `{setup_path}/pure-ftpd`
* Sets `data['isSetup']` flag based on installation status
* Loads localization strings via `public.GetLan('ftp')`
* Includes `js_random` for cache busting
* Renders `ftp.html` template with compiled data dictionary

**Sources:** [BTPanel/__init__.py L3803-L3813](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3803-L3813)

 [BTPanel/__init__.py L767-L776](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L767-L776)

## Logging System

The FTP module provides comprehensive logging capabilities for security auditing and troubleshooting:

```mermaid
flowchart TD

LoginLogs["Login Logs<br>get_login_logs()"]
ActionLogs["Action Logs<br>get_action_logs()"]
SetLogs["set_ftp_logs()<br>Configure Logging"]
PureFTPdLogs["Pure-FTPd Log Files"]
DatabaseLogs["Database Records"]
LoginIP["Login IP Address"]
LoginTime["Login Timestamp"]
Username["FTP Username"]
Action["Action Type"]
FilePath["File Path"]
Result["Operation Result"]

LoginLogs --> PureFTPdLogs
ActionLogs --> PureFTPdLogs
SetLogs --> PureFTPdLogs
LoginLogs --> DatabaseLogs
ActionLogs --> DatabaseLogs
LoginLogs --> LoginIP
LoginLogs --> LoginTime
LoginLogs --> Username
LoginLogs --> Result
ActionLogs --> Action
ActionLogs --> FilePath
ActionLogs --> Username
ActionLogs --> Result

subgraph subGraph3 ["Log Data"]
    LoginIP
    LoginTime
    Username
    Action
    FilePath
    Result
end

subgraph subGraph2 ["Data Sources"]
    PureFTPdLogs
    DatabaseLogs
end

subgraph subGraph1 ["Log Configuration"]
    SetLogs
end

subgraph subGraph0 ["Log Types"]
    LoginLogs
    ActionLogs
end
```

### Log Operations

1. **`get_login_logs()`** - Retrieves FTP login attempts and authentication history
2. **`get_action_logs()`** - Retrieves file operation logs (upload, download, delete, etc.)
3. **`set_ftp_logs()`** - Configures logging verbosity and retention policies

**Sources:** [BTPanel/__init__.py L986-L988](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L986-L988)

 [BTPanel/__init__.py L3816-L3818](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3816-L3818)

## Database Integration

The FTP module stores account information in the SQLite database using the `ftps` table through aaPanel's database abstraction layer:

```mermaid
flowchart TD

FtpModule["ftp Module"]
PublicM["public.M('ftps')<br>Database Abstraction"]
FtpsTable["ftps Table<br>SQLite"]
ID["id"]
Name["name - username"]
Password["password - hashed"]
Path["path - home directory"]
Status["status - enabled/disabled"]
AddTime["addtime - creation timestamp"]

FtpModule --> PublicM
PublicM --> FtpsTable
FtpsTable --> ID
FtpsTable --> Name
FtpsTable --> Password
FtpsTable --> Path
FtpsTable --> Status
FtpsTable --> AddTime

subgraph subGraph0 ["Table Fields"]
    ID
    Name
    Password
    Path
    Status
    AddTime
end
```

Database operations use the standard `public.M()` interface which provides:

* Automatic SQL injection prevention
* Query building methods (`where()`, `select()`, `insert()`, etc.)
* Transaction support
* Connection pooling

Example count query from homepage: `public.M('ftps').count()` [BTPanel/__init__.py L691](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L691-L691)

**Sources:** [BTPanel/__init__.py L691](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L691-L691)

 [BTPanel/__init__.py L3512](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3512-L3512)

## Module Initialization

The FTP module follows a consistent initialization pattern across both API versions:

```javascript
# V1 Initialization
import ftp
ftpObject = ftp.ftp()
defs = ('AddUser', 'DeleteUser', 'SetUserPassword', 'SetStatus', 'setPort',
        'set_user_home', 'get_login_logs', 'get_action_logs', 'set_ftp_logs')
return publicObject(ftpObject, defs, None, pdata)

# V2 Initialization  
import ftp_v2
ftpObject = ftp_v2.ftp()
defs = ('AddUser', 'DeleteUser', 'SetUserPassword', 'SetStatus', 'setPort',
        'set_user_home', 'get_login_logs', 'get_action_logs', 'set_ftp_logs')
return publicObject(ftpObject, defs, None, pdata)
```

The `publicObject()` dispatcher [BTPanel/__init__.py L2697-L2731](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2697-L2731)

:

* Validates the requested action is in the allowed `defs` tuple
* Performs CSRF validation if required
* Sanitizes input parameters (path, filename, etc.)
* Executes the specified method via `getattr()`
* Returns JSON-encoded response

**Sources:** [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L3798-L3819](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3798-L3819)

 [BTPanel/__init__.py L2697-L2731](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2697-L2731)

## Integration Points

The FTP module integrates with several other aaPanel subsystems:

```mermaid
flowchart TD

FtpModule["FTP Module"]
Auth["Authentication<br>comm.local()"]
CSRF["CSRF Protection<br>check_csrf()"]
i18n["Localization<br>public.GetLan()"]
Logs["Operation Logs<br>public.WriteLog()"]
Database["SQLite Database<br>public.M('ftps')"]
Config["Configuration<br>public.GetConfigValue()"]
PureFTPd["Pure-FTPd Service"]
Filesystem["File System<br>Home Directories"]
Sites["Website Management<br>Site-specific FTP"]
Files["File Manager<br>FTP File Access"]

FtpModule --> Auth
FtpModule --> CSRF
FtpModule --> i18n
FtpModule --> Logs
FtpModule --> Database
FtpModule --> Config
FtpModule --> PureFTPd
FtpModule --> Filesystem
FtpModule --> Sites
FtpModule --> Files

subgraph subGraph3 ["Related Modules"]
    Sites
    Files
end

subgraph subGraph2 ["System Services"]
    PureFTPd
    Filesystem
end

subgraph subGraph1 ["Data Layer"]
    Database
    Config
end

subgraph subGraph0 ["Framework Integration"]
    Auth
    CSRF
    i18n
    Logs
end
```

Key integration points:

* **Authentication:** Uses session-based authentication managed by the authentication system
* **CSRF Protection:** Enforced by the request pipeline before method execution
* **Localization:** UI strings loaded via `public.GetLan('ftp')`
* **Logging:** Operations logged via `public.WriteLog()` for audit trail
* **Configuration:** Pure-FTPd path retrieved via `public.GetConfigValue('setup_path')`
* **Database:** Account data persisted in `ftps` table via `public.M()` abstraction

**Sources:** [BTPanel/__init__.py L979-L989](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L979-L989)

 [BTPanel/__init__.py L3798-L3819](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L3798-L3819)

 [BTPanel/__init__.py L2762-L2774](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L2762-L2774)

 [BTPanel/__init__.py L767-L776](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/__init__.py#L767-L776)