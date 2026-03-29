# ITDLUPanel — Changelog (March 2026)

## 2026-03-29

### Features
- Embed performance defaults in installers and vhost template for optimized out-of-the-box configuration
- Nginx version badge with restart/reload/stop controls on Websites page
- Hover on DB version badge shows restart/reload/stop service controls
- Show actual MySQL/MariaDB version detected from the running server

### Fixes
- Increase API rate limit from 60 → 300 requests/min and add 429 retry with exponential backoff
- Show MySQL/MariaDB version in database tab button
- Tab buttons now show only the engine name without the version string

---

## 2026-03-28

### Features
- PHP `disable_functions` management tab for per-version function blocking
- Auto-apply default `disable_functions` on first load
- PHP FPM load status, slow log, and phpinfo tabs
- Enhanced FPM load display with structured PHP Info tab
- Database permission management (Everyone / Local / Specific IP)
- Database SQL import — upload `.sql` / `.sql.gz` files per database
- Multi-select databases for batch backup and delete
- Database backup management UI with count badge and modal
- Disk quota management for websites and databases

### Fixes
- PHP config paths now use `/ITDLUPanel/server/php/conf`; PHPInfo page redesigned
- PHP manager config file, error log, and FPM profile paths corrected
- Monaco editors always use the `vs-dark` theme
- Clipboard copy with fallback for SQL credentials and file paths
- Permission badge `nowrap` + show DB engine version per row
- Website logs path unified to `/ITDLUPanel/logs/`

---

## 2026-03-27

### Features
- Implement nginx multi-version management
- PHP Management modal with extensions, config limits, and editor
- phpMyAdmin Manager with service control and security configuration
- Add Hotlink Protection and Maintenance Mode modules for websites
- Add Redirect Rules module for website configuration
- Add Default Document config and Reverse Proxy module
- Add Limit Access, Deny Access, and Traffic Control UI panels
- Add subdir binding, limit access, deny access, and traffic control APIs
- Backup retention limit for cron job templates
- Dashboard: add system info, swap usage, SSL alerts, security summary, and top processes

### Security
- Enable HTTPS by default with auto-generated self-signed certificate
- Fix critical injection, path traversal, and authentication vulnerabilities

### Fixes
- Fix hotlink protection duplicate referer bug
- Maintenance mode now works correctly with HTTPS sites
- Protect phpMyAdmin default firewall port and sync on change
- Cron job logs now show execution details
- Template schedule opens visual builder instead of raw cron expression
- Filter nginx 2.0 from mainline list (only even minor versions = stable)

### Performance
- Cache nginx version lists with parallel fetch for faster load times

### UI/UX
- Redesign Cron Jobs page to match Websites layout
- SSL Certificate Holder: display by certificate identity with deduplication
- Merge SSL cert display and update into a single editable section
- Merge Limit/Deny/Traffic into a single Access Control section with tabs
- Split Directory panel into Site Directory and Sub Directory Binding tabs
- Remove system info banner (duplicates header)
- Sync Top Processes refresh with main dashboard interval
- Integrate cron backup with panel backup system

---

## 2026-03-25

### Features
- Website logs with daily rotation, date browsing, and `/ITDLU/logs/` storage

### UI/UX
- Merge custom certificate into unified SSL Certificate tab

---

## 2026-03-24

### Features
- Full directory management panel for websites
- Backup management modal for websites
- Add backup column to websites page
- Website logs tab with response log panel
- UFW auto-install with default ports (22, 888, 8888)
- Bulk actions for website management (multi-select operations)
- Deployment package publish/v1
- Implement feature X to enhance user experience and optimize performance

### Fixes
- Stack install now installs one software at a time to avoid conflicts
- Firewall error handling and logs path configuration corrected
- Open directory button navigates to the correct website path

### Documentation
- Comprehensive documentation for 2026-03-24
- Add Vietnamese language documentation

---

## 2026-03-23

### Features
- Dedicated Firewall page with full feature set (rules, zones, logging)
- Implement real nginx version switching (stable/mainline)
- Website SSL management with improved nginx config generation
- Auto-regenerate vhost config when the file is missing
- Beautiful default error pages for new websites

### Fixes
- Fix SSL certificate display: field mapping and enhanced UI
- Fix SSL date display and enhance certificate UI
- Fix nginx: remove default page, auto-create PHP snippets
- Fix phpMyAdmin: serve on port 888 via `conf.d`
- Fix file download: use authenticated fetch instead of plain link
- Fix compress: add tar format support, sync file extension
- Fix date display, SSL column width, and custom cert UX
- Fix orphan domains on site deletion
- Fix editor file tree directory colors in dark mode
- Revert `SetMaxOpenConns(1)` — fixes DB deadlock on concurrent requests
- Remove document root when deleting a website
- Remove stray `wget-log` file

### UI/UX
- Redesign default site pages with light "Lucid Swiss" theme
- Redesign Users and Settings pages with palette-based styling
- Website config editor: replace textarea with Monaco Editor
- Certificate Holder: show domain(s) and issuer instead of folder name
- Add loading indicators for file operations
- Change default bookmark to `/www/wwwroot`

---

## 2026-03-22

### Features
- Add historical monitoring data storage and visualization
- Add clean log button for monitor historical data
- Add file content search (grep) and fix filename search
- Add reset-password CLI command and document default credentials
- Custom server-shield favicon and sidebar logo
- Light/dark theme toggle with white sidebar
- Task queue, messaging, middleware updates, and AppStore improvements
- Add Stacks tab in AppStore for one-click LEMP/LOMP/LAMP install
- Add user password reset API endpoint

### Fixes
- Add light/dark theme support to ProcessTable
- Light sidebar: white background with blue hover/selected items
- Remove JetBrains Mono font from all redesigned pages
- Remove bold font-weight from folder names in Files page
- Use Inter (site font) for UI labels; keep JetBrains Mono only for data values

### UI/UX
- Redesign 7 pages with AppStore-style dual-theme palette
- Redesign AppStore page with ProcessTable-style dual-theme palette
- Redesign Files page with ProcessTable-style dual-theme palette
- Redesign Monitor processes with dark ops dashboard UI
- Redesign Dashboard icons: replace emoji & Ant Design icons with custom SVGs
- Redesign Dashboard icons v2: proper multi-element SVGs
- Redesign SSH Log and Audit Log display
- Rewrite Files page with modular architecture
- Remove redundant realtime charts and status bar from Monitor page
- Rewrite historical charts to match realtime chart style

### Documentation
- Comprehensive project documentation — architecture, spec, README

---

## 2026-03-21

### Features
- Redesign dashboard to match aaPanel-style layout
- Redesign File Manager with aaPanel-style UI + Monaco code editor
- Redesign Database page matching aaPanel reference
- Redesign Website page matching aaPanel reference
- Redesign Monitor page with time-series charts
- Redesign logs page with structured log viewer
- Nginx management modal with 6 tabs (service, config, version, load status, optimization, error log)
- Dashboard hover popovers for Load, CPU, and RAM circles
- Disk popover with filesystem type, mount point, and inode info
- Enrich Disk card with filesystem info, I/O stats, and inode bar
- Rich file type icons with 120+ extension support
- Inline terminal in Files page with cwd support
- Dynamic MOTD generation for terminal
- Terminal MOTD display with redesigned UI
- Dashboard header with blue gradient and icons
- System info in layout header with unified blue theme across all pages
- Unified blue theme + JetBrains Mono font
- Merge system info and action bar into single header row
- Responsive mobile layout optimization
- Comprehensive mobile responsiveness fix for all pages
- Add footer to layout
- Human-readable cron schedule display + Run Now button
- Auto-configure nginx for phpMyAdmin on install/uninstall
- phpMyAdmin integration in Database page and AppStore

### Fixes
- Nginx service status showing stopped and version unknown
- MySQL user creation and password handling
- phpMyAdmin detection + show database credentials
- PHP version selector shows only installed versions
- Terminal default working directory set to `~` (home)
- Terminal status badge color matches connection state
- Monaco editor uses local workers instead of CDN
- Cron log display + website config button
- Database creation validation errors
- Add no-cache headers for `index.html` + rebuild embedded binary
- CPU popover overflow — reduce width, use 70vh maxHeight, contain grid
- Enlarge dashboard popover content for better readability
- Increase load/cpu popover max height to reduce scrollbar crowding
- Move disk popover to wrap circle directly (same pattern as Load/CPU/RAM)
- Wrap disk card in div for popover hover to work
- Popover hover working, card height alignment for Disk + Software/Traffic
- Popover overlay maxWidth too small causing content overflow
- Separate Load and CPU popovers — remove duplicate data
- Redesign all dashboard popovers with proper padding and scroll
- Remove maxWidth:1400 constraint for full-width pages

### UI/UX
- Redesign Security page to match aaPanel reference
- Floating draggable terminal window instead of bottom panel
- Unify Files page colors and typography with Security/Database pages

---

## 2026-03-20

### Features
- Implement all frontend pages with real API integration
- Implement 5 core pages with real API calls
- Add plugin system (Phase 17) and settings management (Phase 18)
- Add software dependency checks and AppStore management modal
- AppStore install progress drawer + uninstall button
- Add phpMyAdmin to AppStore
- Dashboard auto-refresh with interval selector (5s / 10s / 30s)

### Fixes
- Monitor page crash caused by process fields mismatch
- Website creation validation errors

### UI/UX
- Move software paths to `/ITDLUPanel/server/<name>/`
- Set default admin password to `admin@123456` for development
