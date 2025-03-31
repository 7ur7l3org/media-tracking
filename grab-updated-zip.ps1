# Grab script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Project is relative to script location
$projectDir = Join-Path $scriptDir "site"
$resolvedProjectDir = Resolve-Path $projectDir

# Git commit SHA
$sha = git -C $resolvedProjectDir rev-parse --short HEAD

# Timestamp
$timestamp = Get-Date -Format "yyyyMMdd_hhmmt"

# Final zip name and path — now in script directory
$zipName = "ueue-site-src-$sha-$timestamp.zip"
$zipPath = Join-Path $scriptDir $zipName

# Delete old zip if exists
if (Test-Path $zipPath) {
    Remove-Item $zipPath
}

# Create clean temp dir
$tempDir = Join-Path $env:TEMP ("ueue_bundle_" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy all relevant files
Get-ChildItem -Path $resolvedProjectDir -Recurse -Force |
    Where-Object {
        $_.FullName -notmatch '\\\.git\\' -and
        $_.FullName -notmatch '\\node_modules\\' -and
        $_.FullName -notmatch '\\dist\\' -and
        $_.FullName -notmatch '\.zip$'
    } |
    ForEach-Object {
        $relativePath = $_.FullName.Substring($resolvedProjectDir.Path.Length).TrimStart('\')
        $targetPath = Join-Path $tempDir $relativePath
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
        } else {
            Copy-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }

# Create zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)

# Clean up temp
Remove-Item -Recurse -Force $tempDir

Write-Host "`n✅ Created zip: $zipPath"
