package service

import "strings"

// defaultSitePages returns all default HTML pages to place in a new site's document root.
func defaultSitePages(domain string) map[string]string {
	return map[string]string{
		"index.html": defaultWelcomePageHTML(domain),
		"404.html":   default404PageHTML(domain),
		"502.html":   default502PageHTML(domain),
		"403.html":   default403PageHTML(domain),
	}
}

// ---------------------------------------------------------------------------
// Shared CSS – "Lucid Swiss" light theme
// ---------------------------------------------------------------------------

const lightReset = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
font-family:'Segoe UI',system-ui,-apple-system,Helvetica,sans-serif;overflow:hidden;position:relative;
background:var(--bg);color:var(--text)}`

const lightDecor = `
.grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;
background-image:radial-gradient(circle at 1px 1px, var(--dot) 0.8px, transparent 0);
background-size:32px 32px;opacity:.45}
.glow{position:fixed;width:600px;height:600px;border-radius:50%;
background:radial-gradient(circle,var(--glow) 0%,transparent 70%);
filter:blur(100px);opacity:.35;z-index:0}
.glow-1{top:-200px;right:-100px}
.glow-2{bottom:-250px;left:-150px;width:500px;height:500px;opacity:.2}
.line{position:fixed;background:var(--accent);opacity:.06;z-index:0}
.line-h{width:100%;height:1px;top:38%}.line-v{height:100%;width:1px;left:62%}
`

const lightAnim = `
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
.a{opacity:0;animation:rise .7s cubic-bezier(.22,1,.36,1) forwards}
.d1{animation-delay:.08s}.d2{animation-delay:.18s}.d3{animation-delay:.28s}
.d4{animation-delay:.38s}.d5{animation-delay:.48s}.d6{animation-delay:.58s}
`

const lightLayout = `
.wrap{text-align:center;z-index:10;padding:2rem 1.5rem;max-width:580px;position:relative}
.foot{position:fixed;bottom:2rem;font-size:.68rem;letter-spacing:.22em;
text-transform:uppercase;color:var(--muted);z-index:10;font-weight:500}
`

const lightCodeCSS = `
.code{font-family:'Didot','Bodoni MT','Noto Serif Display',Georgia,serif;
font-size:clamp(7.5rem,22vw,14rem);line-height:.85;letter-spacing:-.04em;
color:var(--accent);margin-bottom:1rem;font-weight:700;
text-shadow:0 2px 40px var(--glow);position:relative}
.code::after{content:'';position:absolute;bottom:-.1em;left:50%;transform:translateX(-50%);
width:60%;height:3px;border-radius:2px;
background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.3}
`

const lightBtnCSS = `
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 2rem;
border:1.5px solid var(--accent);border-radius:10px;color:var(--accent);
text-decoration:none;font-size:.85rem;font-weight:600;letter-spacing:.03em;
transition:all .3s cubic-bezier(.22,1,.36,1);background:transparent}
.btn:hover{background:var(--accent);color:#fff;
transform:translateY(-2px);box-shadow:0 8px 30px -8px var(--glow)}
.btn svg{width:16px;height:16px;transition:transform .3s}
.btn:hover svg{transform:translateX(-3px)}
`

func lightBaseCSS() string {
	return lightReset + lightDecor + lightAnim + lightLayout
}

const lightShapes = `<div class="grid-bg"></div>
<div class="glow glow-1"></div>
<div class="glow glow-2"></div>
<div class="line line-h"></div>
<div class="line line-v"></div>`

// ---------------------------------------------------------------------------
// Welcome Page (index.html)
// ---------------------------------------------------------------------------

func defaultWelcomePageHTML(domain string) string {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Welcome — {{DOMAIN}}</title>
<style>
:root{--bg:#F8FAFD;--text:#1E293B;--muted:#94A3B8;--accent:#2563EB;
--glow:rgba(37,99,235,.15);--dot:rgba(148,163,184,.35)}
` + lightBaseCSS() + `
.pill{display:inline-flex;align-items:center;gap:.6rem;padding:.45rem 1.2rem;
border:1.5px solid rgba(37,99,235,.2);border-radius:100px;font-size:.72rem;font-weight:600;
letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:2.2rem;
background:rgba(37,99,235,.04)}
.pill-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);
box-shadow:0 0 10px var(--accent);animation:pulse 2.5s ease-in-out infinite}
.domain{font-family:'Didot','Bodoni MT','Noto Serif Display',Georgia,serif;
font-size:clamp(2.2rem,5.6vw,4.2rem);line-height:1.1;letter-spacing:-.03em;
color:var(--text);margin-bottom:.7rem;font-weight:700}
.sub{font-size:1rem;color:var(--muted);margin-bottom:2.2rem;line-height:1.7;font-weight:400}
.sep{width:48px;height:2px;border-radius:1px;margin:0 auto 1.8rem;
background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.4}
.hint{font-size:.84rem;color:var(--muted);line-height:1.8}
.hint code{color:var(--accent);font-family:'SF Mono',Consolas,'Liberation Mono',monospace;
font-size:.78rem;background:rgba(37,99,235,.06);padding:.2em .5em;border-radius:5px;
border:1px solid rgba(37,99,235,.1)}
.corner{position:fixed;z-index:1;pointer-events:none}
.corner svg{width:100%;height:100%;stroke:var(--accent);stroke-width:.5;fill:none;opacity:.1}
.c-tl{top:32px;left:32px;width:60px;height:60px}
.c-br{bottom:32px;right:32px;width:60px;height:60px;transform:rotate(180deg)}
</style>
</head>
<body>
` + lightShapes + `
<div class="corner c-tl"><svg viewBox="0 0 60 60"><polyline points="0,60 0,0 60,0"/></svg></div>
<div class="corner c-br"><svg viewBox="0 0 60 60"><polyline points="0,60 0,0 60,0"/></svg></div>
<main class="wrap">
<div class="pill a d1"><span class="pill-dot"></span>Site Active</div>
<h1 class="domain a d2">{{DOMAIN}}</h1>
<p class="sub a d3">Your website is live and ready to go.</p>
<div class="sep a d4"></div>
<p class="hint a d5">Replace this page by uploading your files to the document root,<br>
or manage your site through the <code>ITDLUPanel</code> dashboard.</p>
</main>
<footer class="foot a d6">Powered by ITDLUPanel</footer>
</body>
</html>`
	return strings.ReplaceAll(html, "{{DOMAIN}}", domain)
}

// ---------------------------------------------------------------------------
// 404 Page
// ---------------------------------------------------------------------------

func default404PageHTML(domain string) string {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>404 — Page Not Found</title>
<style>
:root{--bg:#F8FAFD;--text:#1E293B;--muted:#94A3B8;--accent:#0891B2;
--glow:rgba(8,145,178,.15);--dot:rgba(148,163,184,.35)}
` + lightBaseCSS() + lightCodeCSS + lightBtnCSS + `
h2{font-size:1.3rem;color:var(--text);margin-bottom:.6rem;font-weight:600;letter-spacing:-.01em}
.desc{font-size:.9rem;color:var(--muted);line-height:1.7;margin-bottom:2.4rem;
max-width:400px;margin-left:auto;margin-right:auto}
.compass{width:56px;height:56px;margin:0 auto 2rem;position:relative;opacity:.3}
.compass-arm{position:absolute;background:var(--accent)}
.compass-h{width:100%;height:1px;top:50%;
background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.compass-v{height:100%;width:1px;left:50%;
background:linear-gradient(180deg,var(--accent),transparent)}
.compass-dot{position:absolute;width:8px;height:8px;border-radius:50%;
border:1.5px solid var(--accent);top:50%;left:50%;transform:translate(-50%,-50%);
animation:float 3s ease-in-out infinite}
</style>
</head>
<body>
` + lightShapes + `
<main class="wrap">
<div class="compass a d1">
<div class="compass-arm compass-h"></div>
<div class="compass-arm compass-v"></div>
<div class="compass-dot"></div>
</div>
<div class="code a d2">404</div>
<h2 class="a d3">Page Not Found</h2>
<p class="desc a d4">The page you're looking for doesn't exist or has been moved to a new address.</p>
<div class="a d5">
<a href="/" class="btn">
<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 2L4 8l6 6"/></svg>
Return Home
</a>
</div>
</main>
<footer class="foot a d6">{{DOMAIN}}</footer>
</body>
</html>`
	return strings.ReplaceAll(html, "{{DOMAIN}}", domain)
}

// ---------------------------------------------------------------------------
// 502 Page
// ---------------------------------------------------------------------------

func default502PageHTML(domain string) string {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>502 — Service Unavailable</title>
<style>
:root{--bg:#F8FAFD;--text:#1E293B;--muted:#94A3B8;--accent:#D97706;
--glow:rgba(217,119,6,.15);--dot:rgba(148,163,184,.35)}
` + lightBaseCSS() + lightCodeCSS + `
h2{font-size:1.3rem;color:var(--text);margin-bottom:.6rem;font-weight:600;letter-spacing:-.01em}
.desc{font-size:.9rem;color:var(--muted);line-height:1.7;margin-bottom:2.2rem;
max-width:420px;margin-left:auto;margin-right:auto}
.rings{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1;pointer-events:none}
.ring{position:absolute;border:1.5px solid var(--accent);border-radius:50%;
top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;
animation:ringPulse 4s cubic-bezier(0,.4,.6,1) infinite}
.ring:nth-child(1){width:120px;height:120px;animation-delay:0s}
.ring:nth-child(2){width:240px;height:240px;animation-delay:.8s}
.ring:nth-child(3){width:380px;height:380px;animation-delay:1.6s}
.ring:nth-child(4){width:540px;height:540px;animation-delay:2.4s}
@keyframes ringPulse{0%{opacity:.18;transform:translate(-50%,-50%) scale(.92)}
100%{opacity:0;transform:translate(-50%,-50%) scale(1.08)}}
.status{display:inline-flex;align-items:center;gap:.6rem;padding:.5rem 1.4rem;
border:1.5px solid rgba(217,119,6,.2);border-radius:10px;font-size:.78rem;font-weight:600;
color:var(--accent);background:rgba(217,119,6,.04)}
.spin{width:14px;height:14px;border:2px solid rgba(217,119,6,.2);
border-top-color:var(--accent);border-radius:50%;animation:spinner .8s linear infinite}
@keyframes spinner{to{transform:rotate(360deg)}}
.status span{font-variant-numeric:tabular-nums;min-width:1.6em;text-align:center}
</style>
</head>
<body>
<div class="rings">
<div class="ring"></div>
<div class="ring"></div>
<div class="ring"></div>
<div class="ring"></div>
</div>
` + lightShapes + `
<main class="wrap">
<div class="code a d1">502</div>
<h2 class="a d2">Service Unavailable</h2>
<p class="desc a d3">The server is temporarily unable to handle your request.<br>Please try again in a moment.</p>
<div class="a d4">
<div class="status"><div class="spin"></div>Refreshing in <span id="cd">30</span>s</div>
</div>
</main>
<footer class="foot a d5">{{DOMAIN}}</footer>
<script>
(function(){var c=30,el=document.getElementById('cd');
var t=setInterval(function(){c--;if(c<=0){clearInterval(t);location.reload()}
el.textContent=c},1000)})();
</script>
</body>
</html>`
	return strings.ReplaceAll(html, "{{DOMAIN}}", domain)
}

// ---------------------------------------------------------------------------
// 403 Page
// ---------------------------------------------------------------------------

func default403PageHTML(domain string) string {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>403 — Access Denied</title>
<style>
:root{--bg:#F8FAFD;--text:#1E293B;--muted:#94A3B8;--accent:#DC2626;
--glow:rgba(220,38,38,.12);--dot:rgba(148,163,184,.35)}
` + lightBaseCSS() + lightCodeCSS + lightBtnCSS + `
h2{font-size:1.3rem;color:var(--text);margin-bottom:.6rem;font-weight:600;letter-spacing:-.01em}
.desc{font-size:.9rem;color:var(--muted);line-height:1.7;margin-bottom:2.4rem;
max-width:420px;margin-left:auto;margin-right:auto}
.shield{width:48px;height:56px;margin:0 auto 2rem;opacity:.35}
.shield svg{width:100%;height:100%}
.bars{position:fixed;z-index:0;pointer-events:none;inset:0;overflow:hidden}
.bar{position:absolute;width:2px;background:linear-gradient(180deg,transparent,var(--accent),transparent);
opacity:.04;animation:slide 20s linear infinite}
.bar:nth-child(1){height:350px;left:12%;top:-200px;animation-delay:0s}
.bar:nth-child(2){height:280px;right:18%;top:-100px;animation-delay:4s}
.bar:nth-child(3){height:420px;left:48%;top:-250px;animation-delay:8s}
.bar:nth-child(4){height:200px;right:35%;top:-120px;animation-delay:12s}
@keyframes slide{0%{transform:translateY(-100%)}100%{transform:translateY(calc(100vh + 100%))}}
</style>
</head>
<body>
` + lightShapes + `
<div class="bars">
<div class="bar"></div><div class="bar"></div>
<div class="bar"></div><div class="bar"></div>
</div>
<main class="wrap">
<div class="shield a d1">
<svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 1L2 5.5V12.5C2 19.35 6.27 25.74 12 27.5C17.73 25.74 22 19.35 22 12.5V5.5L12 1Z"
stroke="var(--accent)" stroke-width="1.2" fill="none"/>
<rect x="9.5" y="11" width="5" height="5.5" rx="1" stroke="var(--accent)" stroke-width="1" fill="none" opacity=".6"/>
<path d="M10.5 11V9.5a1.5 1.5 0 013 0V11" stroke="var(--accent)" stroke-width="1" fill="none" opacity=".6"/>
</svg>
</div>
<div class="code a d2">403</div>
<h2 class="a d3">Access Denied</h2>
<p class="desc a d4">You don't have permission to access this resource.<br>
Please check your credentials or contact the site administrator.</p>
<div class="a d5">
<a href="/" class="btn">
<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 2L4 8l6 6"/></svg>
Return Home
</a>
</div>
</main>
<footer class="foot a d6">{{DOMAIN}}</footer>
</body>
</html>`
	return strings.ReplaceAll(html, "{{DOMAIN}}", domain)
}
