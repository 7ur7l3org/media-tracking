param (
    [string]$ProjectDir = ".\site",
    [string]$DestinationDir = "$PSScriptRoot"
)

# Resolve to full paths
$ProjectDir = (Resolve-Path $ProjectDir).Path
$DestinationDir = (Resolve-Path $DestinationDir).Path

# Git commit SHA and timestamp
$gitSha = (git -C $ProjectDir rev-parse --short HEAD).Trim()
$timestamp = Get-Date -Format "yyyyMMdd_hhmmt"
$zipName = "ueue-site-src-$gitSha-$timestamp.zip"
$zipPath = Join-Path $DestinationDir $zipName

# Temp folder
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ueue-site-temp-" + [System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files from project dir to temp dir preserving relative structure
Get-ChildItem -Path $ProjectDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($ProjectDir.Length).TrimStart('\')
    $targetPath = Join-Path $tempDir $relativePath
    $targetDir = Split-Path $targetPath
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item -Path $_.FullName -Destination $targetPath -Force
}

# Create zip from temp
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)

# Clean up
Remove-Item -Recurse -Force $tempDir

Write-Host "✅ Created zip: $zipPath"
