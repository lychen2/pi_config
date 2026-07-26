#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$DryRun,
    [switch]$WithExternal,
    [switch]$SkipExternal,
    [switch]$WithBrowser,
    [switch]$SkipBrowser,
    [switch]$WithRtk,
    [switch]$SkipRtk,
    [switch]$WithModelDefaults,
    [switch]$SkipModelDefaults
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$exclusivePairs = @(
    @($WithExternal, $SkipExternal, "external package"),
    @($WithBrowser, $SkipBrowser, "browser"),
    @($WithRtk, $SkipRtk, "RTK"),
    @($WithModelDefaults, $SkipModelDefaults, "model default")
)
foreach ($pair in $exclusivePairs) {
    if ($pair[0] -and $pair[1]) {
        throw "Conflicting $($pair[2]) options were provided."
    }
}
$PiConfigHome = if ($env:PI_CONFIG_HOME) {
    $env:PI_CONFIG_HOME
} else {
    Join-Path $HOME ".pi_config"
}
$ArchiveUrl = if ($env:PI_CONFIG_ARCHIVE_URL) {
    $env:PI_CONFIG_ARCHIVE_URL
} else {
    "https://github.com/lychen2/pi_config/archive/refs/heads/main.zip"
}

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Update-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $paths = @($machinePath, $userPath, $env:Path) | Where-Object { $_ }
    $env:Path = $paths -join ";"

    $extraPaths = @(
        (Join-Path $env:APPDATA "npm"),
        (Join-Path $env:ProgramFiles "nodejs"),
        (Join-Path $env:ProgramFiles "Git\cmd"),
        (Join-Path $env:ProgramFiles "Git\bin")
    )
    foreach ($entry in $extraPaths) {
        if ((Test-Path $entry) -and ($env:Path -notlike "*$entry*")) {
            $env:Path = "$entry;$env:Path"
        }
    }
}

function Test-SupportedNode {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        return $false
    }
    try {
        $versionText = (& node -p "process.versions.node").Trim()
        return ([version]$versionText -ge [version]"22.19.0")
    } catch {
        return $false
    }
}

function Install-WinGetPackage([string]$Id, [string]$Name) {
    Write-Step "Installing $Name with WinGet"
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "WinGet failed to install $Name (exit code $LASTEXITCODE)."
    }
    Update-ProcessPath
}

function Install-Prerequisites {
    Update-ProcessPath
    $needsNode = -not (Test-SupportedNode)
    $needsGit = -not (Get-Command git -ErrorAction SilentlyContinue)
    $needsBash = -not (Test-Path (Join-Path $env:ProgramFiles "Git\bin\bash.exe"))

    if ($needsNode -or $needsGit -or $needsBash) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            throw "WinGet is required for a from-zero Windows install. Install Microsoft App Installer, then rerun this script."
        }
    }

    if ($needsNode) {
        Install-WinGetPackage "OpenJS.NodeJS.LTS" "Node.js LTS"
    }
    if ($needsGit -or $needsBash) {
        Install-WinGetPackage "Git.Git" "Git for Windows"
    }

    if (-not (Test-SupportedNode)) {
        throw "Node.js 22.19.0 or newer is unavailable after installation. Open a new PowerShell window and rerun."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm is unavailable after installing Node.js. Open a new PowerShell window and rerun."
    }
}

function Install-Pi {
    if (Get-Command pi -ErrorAction SilentlyContinue) {
        return
    }

    Write-Step "Installing Pi"
    & npm install -g --ignore-scripts "@earendil-works/pi-coding-agent"
    if ($LASTEXITCODE -ne 0) {
        throw "npm failed to install Pi (exit code $LASTEXITCODE)."
    }
    Update-ProcessPath
    if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
        throw "Pi was installed but is not on PATH. Open a new PowerShell window and rerun."
    }
}

function Find-Repository([bool]$AllowDownload = $true) {
    if ($PSScriptRoot -and
        (Test-Path (Join-Path $PSScriptRoot "install.mjs")) -and
        (Test-Path (Join-Path $PSScriptRoot "config"))) {
        return $PSScriptRoot
    }

    if ((Test-Path (Join-Path $PiConfigHome "install.mjs")) -and
        (Test-Path (Join-Path $PiConfigHome "config"))) {
        return $PiConfigHome
    }

    if (-not $AllowDownload) {
        throw "Dry-run requires an existing local pi_config checkout."
    }

    if (Test-Path $PiConfigHome) {
        throw "$PiConfigHome exists but is not a complete pi_config checkout. Move it, then rerun."
    }

    Write-Step "Downloading pi_config to $PiConfigHome"
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pi-config-" + [guid]::NewGuid())
    $archive = Join-Path $tempRoot "pi_config.zip"
    $expanded = Join-Path $tempRoot "expanded"
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    try {
        Invoke-WebRequest -Uri $ArchiveUrl -OutFile $archive -UseBasicParsing
        Expand-Archive -Path $archive -DestinationPath $expanded
        $source = Get-ChildItem -Path $expanded -Directory | Select-Object -First 1
        if (-not $source -or -not (Test-Path (Join-Path $source.FullName "install.mjs"))) {
            throw "The downloaded archive does not contain install.mjs."
        }
        Move-Item -Path $source.FullName -Destination $PiConfigHome
    } finally {
        if (Test-Path $tempRoot) {
            Remove-Item -Path $tempRoot -Recurse -Force
        }
    }

    return $PiConfigHome
}

Update-ProcessPath
if ($DryRun) {
    if (-not (Test-SupportedNode)) {
        throw "Dry-run requires Node.js 22.19.0 or newer."
    }
    $repository = Find-Repository -AllowDownload $false
} else {
    Install-Prerequisites
    Install-Pi
    $repository = Find-Repository
}

$installerArgs = @()
if ($Yes) { $installerArgs += "--yes" }
if ($DryRun) { $installerArgs += "--dry-run" }
if ($WithExternal) { $installerArgs += "--with-external" }
if ($SkipExternal) { $installerArgs += "--skip-external" }
if ($WithBrowser) { $installerArgs += "--with-browser" }
if ($SkipBrowser) { $installerArgs += "--skip-browser" }
if ($WithRtk) { $installerArgs += "--with-rtk" }
if ($SkipRtk) { $installerArgs += "--skip-rtk" }
if ($WithModelDefaults) { $installerArgs += "--with-model-defaults" }
if ($SkipModelDefaults) { $installerArgs += "--skip-model-defaults" }

Write-Step "Running the pi_config installer"
& node (Join-Path $repository "install.mjs") @installerArgs
if ($LASTEXITCODE -ne 0) {
    throw "pi_config installation failed (exit code $LASTEXITCODE)."
}
