# Internationalization and Localization

> **Relevant source files**
> * [BTPanel/languages/all/cht.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/languages/all/cht.json)
> * [BTPanel/languages/all/en.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/languages/all/en.json)
> * [BTPanel/languages/all/zh.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/languages/all/zh.json)

This document explains how aaPanel implements internationalization (i18n) and localization (l10n) to support multiple languages throughout the system. It covers both server-side and client-side translation mechanisms, language configuration, and the overall architecture of the translation system.

For information about configuring panel settings, including language options, see [Configuration Management](/aaPanel/aaPanel/11-development-setup).

## Architecture Overview

aaPanel implements a comprehensive internationalization system using a combination of server-side and client-side translation mechanisms.

```mermaid
flowchart TD

GettextLib["Gettext Library"]
ServerFunctions["Translation Functions"]
GetMsgFunc["GetMsg()"]
GetLanFunc["GetLan()"]
GettextMsgFunc["gettext_msg()"]
WriteLogGettext["write_log_gettext()"]
JSONFiles["JSON Language Files"]
LanJS["lan.js (JavaScript Client)"]
LangConfig["Language Configuration"]
LangFiles["Language Files"]
PublicJSON["public.json"]
LogJSON["log.json"]
TemplateJSON["template.json"]
User["User Interface"]

LangConfig --> ServerFunctions
LangConfig --> JSONFiles
User --> LanJS
User --> ServerFunctions

subgraph subGraph2 ["Language Data"]
    LangConfig
    LangFiles
    PublicJSON
    LogJSON
    TemplateJSON
    LangConfig --> LangFiles
    LangFiles --> PublicJSON
    LangFiles --> LogJSON
    LangFiles --> TemplateJSON
end

subgraph subGraph1 ["Client-Side Translation"]
    JSONFiles
    LanJS
    JSONFiles --> LanJS
end

subgraph subGraph0 ["Server-Side Translation"]
    GettextLib
    ServerFunctions
    GetMsgFunc
    GetLanFunc
    GettextMsgFunc
    WriteLogGettext
    GettextLib --> ServerFunctions
    ServerFunctions --> GetMsgFunc
    ServerFunctions --> GetLanFunc
    ServerFunctions --> GettextMsgFunc
    ServerFunctions --> WriteLogGettext
end
```

Sources: [class/public.py L15-L18](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L15-L18)

 [class/public.py L379-L385](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L379-L385)

 [class/public.py L451-L458](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L451-L458)

 [BTPanel/static/language/English/lan.js L1-L41](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/lan.js#L1-L41)

## Language Configuration

The system language is controlled by a configuration setting that can be retrieved using the `GetLanguage()` function:

```mermaid
flowchart TD

User["User"]
Settings["Panel Settings"]
ConfigFile["config/config.json"]
ServerCode["Server Code"]
ClientCode["Client Code"]
LangFiles["Language Files"]

User --> Settings
Settings --> ConfigFile
ServerCode --> ConfigFile
ServerCode --> ConfigFile
ClientCode --> LangFiles
```

The language setting affects both server-side translations (via gettext) and client-side translations (via JSON language files).

Sources: [class/public.py L451-L458](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L451-L458)

 [class/public.py L460-L488](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L460-L488)

## Translation Mechanisms

### Server-Side Translation

Server-side translation in aaPanel uses Python's gettext library, initialized in `public.py`:

```mermaid
flowchart TD

Code["Python Code"]
GettextMsg["gettext_msg()"]
GettextInit["gettext Initialization"]
GettextFunc["_ = es.gettext"]
TranslatedText["Translated Text"]
ReturnMsg["return_msg_gettext()"]
TranslatedMsg["Translated Message"]
WriteLog["write_log_gettext()"]
TranslatedLog["Translated Log Entry"]

subgraph subGraph0 ["Server-Side Translation Flow"]
    Code
    GettextMsg
    GettextInit
    GettextFunc
    TranslatedText
    ReturnMsg
    TranslatedMsg
    WriteLog
    TranslatedLog
    Code --> GettextMsg
    GettextInit --> GettextFunc
    GettextFunc --> GettextMsg
    GettextMsg --> TranslatedText
    Code --> ReturnMsg
    ReturnMsg --> TranslatedMsg
    Code --> WriteLog
    WriteLog --> TranslatedLog
end
```

Key server-side translation functions:

| Function | Purpose | Source |
| --- | --- | --- |
| `gettext_msg(msg, args)` | Translates and formats messages with arguments | [public.py L379-L385](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/public.py#L379-L385) |
| `write_log_gettext(type, logmsg, args, not_web)` | Writes logs with translated messages | [public.py L387-L409](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/public.py#L387-L409) |
| `return_msg_gettext(status, msg, args)` | Returns status messages with translations | [public.py L237-L244](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/public.py#L237-L244) |
| `GetMsg(key, args)` | Gets translations from public.json | [public.py L505-L519](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/public.py#L505-L519) |
| `GetLan(key)` | Gets translations from template.json | [public.py L489-L503](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/public.py#L489-L503) |

Sources: [class/public.py L15-L18](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L15-L18)

 [class/public.py L379-L385](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L379-L385)

 [class/public.py L387-L409](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L387-L409)

 [class/public.py L237-L244](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L237-L244)

 [class/public.py L505-L519](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L505-L519)

 [class/public.py L489-L503](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L489-L503)

### Client-Side Translation

Client-side translation uses JSON files and JavaScript functions:

```mermaid
flowchart TD

UI["UI Code"]
LanGet["lan.get()"]
Messages["lan.msgs Object"]
TranslatedUI["Translated UI Text"]

subgraph subGraph0 ["Client-Side Translation Flow"]
    UI
    LanGet
    Messages
    TranslatedUI
    UI --> LanGet
    LanGet --> Messages
    Messages --> TranslatedUI
end
```

The main client-side translation mechanism is the `lan.get()` function in `lan.js`:

```javascript
get: function(key, args) {
    var msgs = {
        "diskinfo_span_1":"Available space on disk partition [{1}] is less than 1GB...",
        // More messages...
    }
    
    if(!msgs[key]) return '';
    msg = msgs[key];
    for(var i=0; i<args.length; i++){
        msg = msg.replace('{'+(i+1)+'}', args[i]+'');
    }
    
    return msg;
}
```

Sources: [BTPanel/static/language/English/lan.js L1-L41](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/lan.js#L1-L41)

## Language Files Organization

aaPanel organizes translations in a structured directory hierarchy:

```markdown
BTPanel/static/language/
├── English/
│   ├── lan.js          # JavaScript UI translations
│   ├── log.json        # Log message translations
│   ├── public.json     # Public message translations
│   └── template.json   # Template message translations
└── [Other Languages]/
    ├── ...
```

Each language file serves a specific purpose:

| File | Purpose | Example Content |
| --- | --- | --- |
| `lan.js` | Client-side UI translations | UI messages, confirmations, errors |
| `log.json` | System log messages | Operation logs, status changes |
| `public.json` | General-purpose messages | Common messages, errors, status notifications |
| `template.json` | UI template messages | Page titles, section headers, button labels |

Sources: [BTPanel/static/language/English/lan.js](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/lan.js)

 [BTPanel/static/language/English/log.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/log.json)

 [BTPanel/static/language/English/public.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/public.json)

 [BTPanel/static/language/English/template.json](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/template.json)

## Translation Process Flow

When a user interacts with aaPanel, translations flow through the system as follows:

```mermaid
sequenceDiagram
  participant User
  participant Web UI
  participant Client JavaScript
  participant Server API
  participant Translation Functions
  participant Language Files

  User->>Web UI: Access Panel
  Web UI->>Server API: Get Configuration
  Server API->>Translation Functions: GetLanguage()
  Translation Functions-->>Server API: Current Language
  Server API-->>Web UI: Configuration with Language
  Web UI->>Client JavaScript: Initialize UI
  Client JavaScript->>Language Files: Load Language Files
  Language Files-->>Client JavaScript: UI Translations
  User->>Web UI: Perform Action
  Web UI->>Server API: Make API Request
  Server API->>Translation Functions: gettext_msg() / GetMsg()
  Translation Functions->>Language Files: Get Translation
  Language Files-->>Translation Functions: Translated Message
  Translation Functions-->>Server API: Localized Response
  Server API-->>Web UI: Response with Translated Messages
  Web UI->>Client JavaScript: Update UI
  Client JavaScript->>Language Files: lan.get()
  Language Files-->>Client JavaScript: Client-side Translations
  Client JavaScript-->>Web UI: Translated UI Elements
  Web UI-->>User: Display Localized Interface
```

Sources: [class/public.py L379-L385](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L379-L385)

 [class/public.py L451-L458](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L451-L458)

 [BTPanel/static/language/English/lan.js L1-L41](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/lan.js#L1-L41)

## Message Formatting

Both server-side and client-side translation functions support parameter substitution:

```mermaid
flowchart TD

Template["Message Template with Placeholders"]
ServerFormat["Server-side Formatting"]
ClientFormat["Client-side Formatting"]
GettextMsg["gettext_msg('Hello, {1}!', [username])"]
LanGet["lan.get('hello_user', [username])"]
ServerResult["'Hello, John!'"]
ClientResult["'Hello, John!'"]

subgraph subGraph0 ["Message Formatting"]
    Template
    ServerFormat
    ClientFormat
    GettextMsg
    LanGet
    ServerResult
    ClientResult
    Template --> ServerFormat
    Template --> ClientFormat
    ServerFormat --> GettextMsg
    ClientFormat --> LanGet
    GettextMsg --> ServerResult
    LanGet --> ClientResult
end
```

Examples of message formatting:

1. Server-side with `gettext_msg()`: ```markdown gettext_msg("SUCCESS_ADD", [item_name])  # "Successfully added {1}" ```
2. Client-side with `lan.get()`: ```sql lan.get("del", ["my_file.txt"])  # "Delete [{1}]" ```

Sources: [class/public.py L379-L385](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L379-L385)

 [BTPanel/static/language/English/lan.js L1-L41](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/BTPanel/static/language/English/lan.js#L1-L41)

## Relationship to Other Systems

The internationalization system interacts with various components of aaPanel:

```mermaid
flowchart TD

I18N["Internationalization System"]
PanelSettings["Panel Settings"]
Logging["Logging System"]
UserInterface["User Interface"]
APIResponses["API Responses"]
ErrorHandling["Error Handling"]
LogDB["Logs Database"]
UserExp["User Experience"]
ClientApps["Client Applications"]
UserNotifications["User Notifications"]

I18N --> PanelSettings
I18N --> Logging
I18N --> UserInterface
I18N --> APIResponses
I18N --> ErrorHandling
PanelSettings --> I18N
Logging --> LogDB
UserInterface --> UserExp
APIResponses --> ClientApps
ErrorHandling --> UserNotifications
```

The logging system particularly relies on translated messages through the `write_log_gettext()` function, which ensures log entries are stored in the user's configured language.

Sources: [class/public.py L387-L409](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L387-L409)

 [class/public.py L410-L449](https://github.com/aaPanel/aaPanel/blob/b6e4ab8b/class/public.py#L410-L449)

## Adding New Languages

To add support for a new language:

1. Create a new directory in `BTPanel/static/language/` with the language name
2. Create the required files (`lan.js`, `log.json`, `public.json`, `template.json`)
3. Translate all messages in these files
4. Configure gettext to recognize the new language

## Conclusion

aaPanel's internationalization and localization system provides a comprehensive solution for supporting multiple languages throughout the application. By using a combination of gettext for server-side translations and JSON files for client-side translations, it ensures a consistent multilingual experience for users.

The system is designed to be easily extensible with new languages and provides developers with clear methods for ensuring their code supports internationalization through the provided translation functions.