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
// Shared CSS fragments
// ---------------------------------------------------------------------------

const baseCSSReset = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
font-family:'Segoe UI',system-ui,-apple-system,Helvetica,sans-serif;overflow:hidden;position:relative}`

const baseCSSBackground = `
body{background:var(--bg);color:var(--text)}
body::after{content:'';position:fixed;inset:0;opacity:.45;
background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");
pointer-events:none;z-index:200}
.orb{position:fixed;width:55vmax;height:55vmax;border-radius:50%;
background:radial-gradient(circle,var(--glow) 0%,transparent 70%);
filter:blur(70px);opacity:.13;animation:drift 22s ease-in-out infinite alternate;z-index:0}
.ring{position:fixed;border:1px solid var(--accent);border-radius:50%;opacity:.04;
width:var(--s);height:var(--s);animation:spin var(--dur) linear infinite;z-index:0}
`

const baseCSSAnimations = `
@keyframes drift{from{transform:translate(-8%,-8%) scale(1)}to{transform:translate(8%,8%) scale(1.12)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:.08;transform:scale(1)}50%{opacity:.18;transform:scale(1.06)}}
.r{opacity:0;animation:fadeUp .72s cubic-bezier(.16,1,.3,1) forwards}
.r1{animation-delay:.1s}.r2{animation-delay:.24s}.r3{animation-delay:.38s}
.r4{animation-delay:.52s}.r5{animation-delay:.66s}.r6{animation-delay:.8s}
`

const baseCSSLayout = `
.content{text-align:center;z-index:10;padding:2rem;max-width:640px;position:relative}
.footer{position:fixed;bottom:2rem;font-size:.7rem;letter-spacing:.18em;
text-transform:uppercase;color:var(--muted);z-index:10}
.footer a{color:var(--muted);text-decoration:none;transition:color .3s}
.footer a:hover{color:var(--accent)}
`

const baseCSSCode = `
.code{font-family:Georgia,'Palatino Linotype','Book Antiqua',Palatino,serif;
font-size:clamp(7rem,20vw,15rem);line-height:.9;letter-spacing:-.02em;
background:linear-gradient(135deg,var(--accent),var(--accent-end));
-webkit-background-clip:text;-webkit-text-fill-color:transparent;
background-clip:text;filter:drop-shadow(0 0 50px var(--glow));margin-bottom:1.2rem}
`

const baseCSSButton = `
.btn{display:inline-block;padding:.7rem 2.2rem;border:1px solid var(--accent-dim);
border-radius:100px;color:var(--accent);text-decoration:none;font-size:.85rem;
letter-spacing:.06em;transition:all .35s cubic-bezier(.16,1,.3,1);background:transparent}
.btn:hover{background:var(--accent-dim);border-color:var(--accent);
transform:translateY(-2px);box-shadow:0 12px 40px -12px var(--glow)}
`

func baseCSS() string {
	return baseCSSReset + baseCSSBackground + baseCSSAnimations + baseCSSLayout
}

const bgShapes = `<div class="orb"></div>
<div class="ring" style="--s:440px;--dur:58s;top:-130px;right:-90px"></div>
<div class="ring" style="--s:300px;--dur:42s;bottom:-80px;left:-70px;animation-direction:reverse"></div>
<div class="ring" style="--s:200px;--dur:32s;top:45%;left:12%"></div>`

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
:root{--bg:#080b16;--text:#d1d5db;--muted:#4b5563;--accent:#f59e0b;
--accent-end:#f97316;--glow:rgba(245,158,11,.35);--accent-dim:rgba(245,158,11,.1)}
` + baseCSS() + `
.badge{display:inline-flex;align-items:center;gap:.5rem;padding:.45rem 1.2rem;
border:1px solid var(--accent-dim);border-radius:100px;font-size:.7rem;
letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:2.5rem;
backdrop-filter:blur(8px);background:rgba(245,158,11,.04)}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;
background:var(--accent);box-shadow:0 0 12px var(--accent);animation:pulse 2s ease-in-out infinite}
.domain{font-family:Georgia,'Palatino Linotype','Book Antiqua',Palatino,serif;
font-size:clamp(2.4rem,5.8vw,4.8rem);line-height:1.08;letter-spacing:-.035em;
color:#fff;margin-bottom:.8rem;text-shadow:0 0 80px var(--glow)}
.tagline{font-size:1.1rem;color:var(--muted);margin-bottom:2.5rem;line-height:1.6}
.divider{width:40px;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);
margin:0 auto 2rem;opacity:.5}
.hint{font-size:.82rem;color:var(--muted);line-height:1.7}
.hint code{color:var(--accent);font-family:Consolas,'Courier New',monospace;font-size:.8rem;
background:rgba(245,158,11,.08);padding:.15em .45em;border-radius:4px}
</style>
</head>
<body>
` + bgShapes + `
<main class="content">
<div class="badge r r1">Site Active</div>
<h1 class="domain r r2">{{DOMAIN}}</h1>
<p class="tagline r r3">Your website is live and ready to go.</p>
<div class="divider r r4"></div>
<p class="hint r r5">Replace this page by uploading your files to the document root,<br>
or manage your site through the <code>ITDLUPanel</code> dashboard.</p>
</main>
<footer class="footer r r6">Powered by ITDLUPanel</footer>
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
:root{--bg:#080b16;--text:#d1d5db;--muted:#4b5563;--accent:#22d3ee;
--accent-end:#0ea5e9;--glow:rgba(34,211,238,.3);--accent-dim:rgba(34,211,238,.1)}
` + baseCSS() + baseCSSCode + baseCSSButton + `
h2{font-size:1.35rem;color:#fff;margin-bottom:.8rem;letter-spacing:-.01em;font-weight:500}
.desc{font-size:.92rem;color:var(--muted);line-height:1.7;margin-bottom:2.5rem;max-width:420px;margin-left:auto;margin-right:auto}
.nav{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
.compass{width:56px;height:56px;margin:0 auto 1.8rem;position:relative;opacity:.25}
.compass::before,.compass::after{content:'';position:absolute;background:var(--accent)}
.compass::before{width:1px;height:100%;left:50%;transform:translateX(-50%);
background:linear-gradient(to bottom,var(--accent),transparent)}
.compass::after{width:100%;height:1px;top:50%;transform:translateY(-50%);
background:linear-gradient(to right,transparent,var(--accent),transparent)}
.compass-dot{position:absolute;width:8px;height:8px;border-radius:50%;
border:1.5px solid var(--accent);top:50%;left:50%;transform:translate(-50%,-50%)}
</style>
</head>
<body>
` + bgShapes + `
<main class="content">
<div class="compass r r1"><div class="compass-dot"></div></div>
<div class="code r r2">404</div>
<h2 class="r r3">Page Not Found</h2>
<p class="desc r r4">The page you're looking for doesn't exist or has been moved to a new address.</p>
<div class="nav r r5">
<a href="/" class="btn">← Return Home</a>
</div>
</main>
<footer class="footer r r6">{{DOMAIN}}</footer>
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
:root{--bg:#080b16;--text:#d1d5db;--muted:#4b5563;--accent:#fb923c;
--accent-end:#f97316;--glow:rgba(251,146,60,.3);--accent-dim:rgba(251,146,60,.1)}
` + baseCSS() + baseCSSCode + `
h2{font-size:1.35rem;color:#fff;margin-bottom:.8rem;letter-spacing:-.01em;font-weight:500}
.desc{font-size:.92rem;color:var(--muted);line-height:1.7;margin-bottom:2rem;max-width:440px;margin-left:auto;margin-right:auto}
.radar{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1;pointer-events:none}
.radar-ring{position:absolute;border:1px solid var(--accent);border-radius:50%;
top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;
animation:radarPulse 3.5s cubic-bezier(0,.5,.5,1) infinite}
.radar-ring:nth-child(1){width:160px;height:160px;animation-delay:0s}
.radar-ring:nth-child(2){width:300px;height:300px;animation-delay:.7s}
.radar-ring:nth-child(3){width:460px;height:460px;animation-delay:1.4s}
.radar-ring:nth-child(4){width:640px;height:640px;animation-delay:2.1s}
@keyframes radarPulse{0%{opacity:.2;transform:translate(-50%,-50%) scale(.85)}
100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
.refresh{display:inline-flex;align-items:center;gap:.6rem;padding:.55rem 1.4rem;
border:1px solid var(--accent-dim);border-radius:100px;font-size:.78rem;
color:var(--accent);letter-spacing:.08em;background:rgba(251,146,60,.04)}
.refresh span{font-variant-numeric:tabular-nums;min-width:1.6em;text-align:center}
.spinner{width:14px;height:14px;border:1.5px solid var(--accent-dim);
border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
</style>
</head>
<body>
<div class="radar">
<div class="radar-ring"></div>
<div class="radar-ring"></div>
<div class="radar-ring"></div>
<div class="radar-ring"></div>
</div>
` + bgShapes + `
<main class="content">
<div class="code r r1">502</div>
<h2 class="r r2">Service Unavailable</h2>
<p class="desc r r3">The server is temporarily unable to handle your request.<br>Please try again in a moment.</p>
<div class="r r4">
<div class="refresh"><div class="spinner"></div>Refreshing in <span id="cd">30</span>s</div>
</div>
</main>
<footer class="footer r r5">{{DOMAIN}}</footer>
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
:root{--bg:#080b16;--text:#d1d5db;--muted:#4b5563;--accent:#f87171;
--accent-end:#ef4444;--glow:rgba(248,113,113,.3);--accent-dim:rgba(248,113,113,.1)}
` + baseCSS() + baseCSSCode + baseCSSButton + `
h2{font-size:1.35rem;color:#fff;margin-bottom:.8rem;letter-spacing:-.01em;font-weight:500}
.desc{font-size:.92rem;color:var(--muted);line-height:1.7;margin-bottom:2.5rem;max-width:420px;margin-left:auto;margin-right:auto}
.shield{width:48px;height:48px;margin:0 auto 2rem;position:relative}
.shield-icon{width:48px;height:56px;position:relative}
.shield-icon svg{width:100%;height:100%}
.lines{position:fixed;z-index:0;pointer-events:none;inset:0;overflow:hidden}
.lines .l{position:absolute;width:1px;background:linear-gradient(to bottom,transparent,var(--accent),transparent);
opacity:.035;animation:lineSlide 18s linear infinite}
.lines .l:nth-child(1){height:400px;left:15%;top:-200px;animation-delay:0s;transform:rotate(25deg)}
.lines .l:nth-child(2){height:300px;right:20%;top:30%;animation-delay:3s;transform:rotate(-15deg)}
.lines .l:nth-child(3){height:500px;left:55%;top:-100px;animation-delay:6s;transform:rotate(35deg)}
.lines .l:nth-child(4){height:250px;right:35%;bottom:10%;animation-delay:9s;transform:rotate(-30deg)}
@keyframes lineSlide{0%{transform:translateY(-100%) rotate(var(--r,25deg))}
100%{transform:translateY(100vh) rotate(var(--r,25deg))}}
</style>
</head>
<body>
` + bgShapes + `
<div class="lines">
<div class="l" style="--r:25deg"></div>
<div class="l" style="--r:-15deg"></div>
<div class="l" style="--r:35deg"></div>
<div class="l" style="--r:-30deg"></div>
</div>
<main class="content">
<div class="shield r r1">
<div class="shield-icon">
<svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 1L2 5.5V12.5C2 19.35 6.27 25.74 12 27.5C17.73 25.74 22 19.35 22 12.5V5.5L12 1Z"
stroke="currentColor" stroke-width="1" fill="none" opacity=".3" color="var(--accent)"/>
<rect x="9.5" y="10" width="5" height="6" rx="1" stroke="currentColor" stroke-width="1"
fill="none" color="var(--accent)" opacity=".5"/>
<path d="M10.5 10V8.5a1.5 1.5 0 013 0V10" stroke="currentColor" stroke-width="1"
fill="none" color="var(--accent)" opacity=".5"/>
</svg>
</div>
</div>
<div class="code r r2">403</div>
<h2 class="r r3">Access Denied</h2>
<p class="desc r r4">You don't have permission to access this resource.<br>
Please check your credentials or contact the site administrator.</p>
<div class="r r5">
<a href="/" class="btn">← Return Home</a>
</div>
</main>
<footer class="footer r r6">{{DOMAIN}}</footer>
</body>
</html>`
	return strings.ReplaceAll(html, "{{DOMAIN}}", domain)
}
