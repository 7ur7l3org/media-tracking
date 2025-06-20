# test-all.ps1

$ErrorActionPreference = "Stop"

function Run-And-Show {
  param (
    [string]$CommandLine
  )
  Write-Host "▶ $CommandLine"
  Invoke-Expression $CommandLine
}

Write-Host "🔧 Starting local CORS-enabled HTTP server with Deno (port 8000)..."
$server = Start-Process "deno" "run --allow-net --allow-read --allow-sys https://deno.land/std/http/file_server.ts --cors --port 8000" -NoNewWindow -PassThru
Start-Sleep -Seconds 2

Write-Host "🌐 Opening Service Worker test page in browser..."
Start-Process "http://localhost:8000"

Read-Host "✅ Once you've confirmed the SW is green in DevTools, press ENTER to continue..."

Write-Host "`n🧪 Running Bun CLI tests (for local-only workflows with all .js files available)..."
Run-And-Show 'bun-profile.exe run api/add.js "?a=1&b=2" --a=5'
Run-And-Show 'bun-profile.exe run api/multiply.js --x=3 --y=4 "?x=2&y=3"'
Run-And-Show 'bun-profile.exe run api/calculateArea.js "?width=3&height=4" --margin=1'

Read-Host "✅ Bun CLI ran. Press ENTER to test Bun --bun-serve mode..."

Write-Host "`n🚀 Bun (with --bun-serve)"
$bunserve = Start-Process "bun-profile.exe" "run api/add.js --a=2 --b=3 --bun-serve" -PassThru
Start-Sleep -Seconds 3
Run-And-Show 'curl.exe "http://localhost:3000/?a=6&b=7"'
Stop-Process -Id $bunserve.Id

Read-Host "✅ Bun --bun-serve ran. Press ENTER to test remote execution via Deno..."

Write-Host "`n🧪 Running Deno remote module tests..."
Run-And-Show 'deno run --reload --allow-net http://localtest.me:8000/api/add.js "?a=8&b=9"'
Run-And-Show 'deno run --reload --allow-net http://localtest.me:8000/api/calculateArea.js "?width=7&height=4&margin=1" --margin=3'

Read-Host "✅ Deno remote ran. Press ENTER to test Wrangler single-function (add.js)..."

Write-Host "`n🚀 Wrangler (single function: add.js)..."
$wr1 = Start-Process "npx" "wrangler dev api/add.js" -PassThru
Start-Sleep -Seconds 6
Run-And-Show 'curl.exe "http://127.0.0.1:8787/?a=1&b=2"'
Stop-Process -Id $wr1.Id
Start-Sleep -Seconds 2

Read-Host "✅ Press ENTER to test full API router..."

Write-Host "`n🚀 Wrangler (full router: index.js)..."
$wr2 = Start-Process "npx" "wrangler dev api/index.js" -PassThru
Start-Sleep -Seconds 6
Run-And-Show 'curl.exe "http://127.0.0.1:8787/api/add.js?a=2&b=3"'
Run-And-Show 'curl.exe "http://127.0.0.1:8787/api/multiply.js?x=4&y=5"'
Run-And-Show 'curl.exe "http://127.0.0.1:8787/api/calculateArea.js?width=6&height=3&margin=2"'
Stop-Process -Id $wr2.Id
Start-Sleep -Seconds 2

Read-Host "✅ Final test: paste this in DevTools of another origin. Press ENTER when done..."

Write-Host "`n🧪 DevTools test:"
Write-Host '  const { calculateArea: area } = await import("http://localhost:8000/api/calculateArea.js");'
Write-Host '  console.log(area({ width: 3, height: 3 }));'

Read-Host "`n✅ Done! Press ENTER to clean up..."

Write-Host "🧹 Stopping local Deno server..."
Stop-Process -Id $server.Id -ErrorAction SilentlyContinue

Write-Host "`n✅ All tests complete!"
