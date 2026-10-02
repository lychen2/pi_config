#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$DryRun,
    [switch]$WithExternal,
    [switch]$SkipExternal,
    [switch]$WithRtk,
    [switch]$SkipRtk,
    [switch]$WithModelDefaults,
    [switch]$SkipModelDefaults,
    [switch]$CleanPlugins,
    [switch]$TestArchiveUpdate
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$exclusivePairs = @(
    @($WithExternal, $SkipExternal, "external package"),
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
$ArchiveUrl = if ($TestArchiveUpdate) {
    ""
} elseif ($env:PI_CONFIG_ARCHIVE_URL) {
    $env:PI_CONFIG_ARCHIVE_URL
} else {
    try {
        $headers = @{
            Accept = "application/vnd.github+json"
            "User-Agent" = "pi-config-installer"
        }
        $latestCommit = Invoke-RestMethod `
            -Uri "https://api.github.com/repos/lychen2/pi_config/commits/main" `
            -Headers $headers `
            -TimeoutSec 30 `
            -UseBasicParsing
        "https://github.com/lychen2/pi_config/archive/$($latestCommit.sha).zip"
    } catch {
        throw "Failed to resolve the latest pi_config commit: $($_.Exception.Message)"
    }
}

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Update-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $entries = New-Object 'System.Collections.Generic.List[string]'

    foreach ($pathValue in @($env:Path, $userPath, $machinePath)) {
        if (-not $pathValue) {
            continue
        }
        foreach ($entry in ($pathValue -split ";")) {
            $trimmed = $entry.Trim()
            if ($trimmed -and $seen.Add($trimmed)) {
                [void]$entries.Add($trimmed)
            }
        }
    }

    $extraPaths = @(
        (Join-Path $HOME ".local\bin"),
        (Join-Path $env:APPDATA "npm"),
        (Join-Path $env:ProgramFiles "nodejs"),
        (Join-Path $env:ProgramFiles "Git\cmd"),
        (Join-Path $env:ProgramFiles "Git\bin"),
        (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd"),
        (Join-Path $env:LOCALAPPDATA "Programs\Git\bin")
    )
    foreach ($entry in $extraPaths) {
        if ((Test-Path $entry) -and $seen.Add($entry)) {
            $entries.Insert(0, $entry)
        }
    }

    $env:Path = $entries -join ";"
    if (Get-Command node -ErrorAction SilentlyContinue) {
        try {
            $nodePath = (& node -p "process.execPath").Trim()
            $nodeDirectory = Split-Path $nodePath -Parent
            if ((Test-Path $nodeDirectory) -and $seen.Add($nodeDirectory)) {
                $entries.Insert(0, $nodeDirectory)
            }
        } catch {
            # Install-Prerequisites reports an actionable error after bootstrap.
        }
    }
    $env:Path = $entries -join ";"
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

function Test-BashAvailable {
    if (Get-Command bash.exe -ErrorAction SilentlyContinue) {
        return $true
    }

    $candidates = @(
        (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Git\bin\bash.exe")
    )
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        $gitRoot = Split-Path (Split-Path $git.Source -Parent) -Parent
        $candidates += Join-Path $gitRoot "bin\bash.exe"
    }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $true
        }
    }
    return $false
}

function Install-WinGetPackage([string]$Id, [string]$Name) {
    Write-Step "Installing $Name with WinGet"
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    $exitCode = $LASTEXITCODE
    Update-ProcessPath

    if ($exitCode -eq -1978335189) {
        Write-Host "$Name is already installed and has no available upgrade."
        return
    }
    if ($exitCode -ne 0) {
        throw "WinGet failed to install $Name (exit code $exitCode)."
    }
}

function Install-Prerequisites {
    Update-ProcessPath
    $needsNode = -not (Test-SupportedNode)
    $needsGit = -not (Get-Command git.exe -ErrorAction SilentlyContinue)
    $needsBash = -not (Test-BashAvailable)

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
    & cmd.exe /d /c "node --version" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "node.exe is available in PowerShell but unavailable to cmd.exe child processes."
    }
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw "npm.cmd is unavailable after installing Node.js. Open a new PowerShell window and rerun."
    }
    if (-not (Test-BashAvailable)) {
        throw "A supported Bash shell is unavailable after installing Git for Windows."
    }
}

function Expand-ZipArchive([string]$ArchivePath, [string]$DestinationPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $DestinationPath)
}

function Install-Pi {
    if (Get-Command pi.cmd -ErrorAction SilentlyContinue) {
        return
    }

    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw "npm.cmd is unavailable. Reinstall Node.js LTS or open a new PowerShell window."
    }

    Write-Step "Installing Pi"
    & $npmCommand.Source install -g --ignore-scripts "@earendil-works/pi-coding-agent"
    if ($LASTEXITCODE -ne 0) {
        throw "npm.cmd failed to install Pi (exit code $LASTEXITCODE)."
    }
    Update-ProcessPath
    if (-not (Get-Command pi.cmd -ErrorAction SilentlyContinue)) {
        throw "Pi was installed but pi.cmd is not on PATH. Open a new PowerShell window and rerun."
    }
}

function Switch-Repository([string]$Source, [string]$Destination) {
    $backup = "$Destination.backup-$([guid]::NewGuid().ToString('N'))"
    $hadDestination = Test-Path $Destination

    if ($hadDestination) {
        Move-Item -Path $Destination -Destination $backup
    }
    try {
        Move-Item -Path $Source -Destination $Destination
    } catch {
        if ($hadDestination -and (Test-Path $backup)) {
            if (Test-Path $Destination) {
                $failedSwitch = "$Destination.failed-$([guid]::NewGuid().ToString('N'))"
                Move-Item -Path $Destination -Destination $failedSwitch
            }
            Move-Item -Path $backup -Destination $Destination
        }
        throw
    }
    if ($hadDestination) {
        Write-Host "Previous repository preserved at $backup"
    }
}

function Sync-Repository([string]$Destination) {
    $action = if (Test-Path $Destination) { "Refreshing" } else { "Downloading" }
    Write-Step "$action pi_config at $Destination"

    # Stage beside the destination so extraction and directory moves stay on one volume.
    $parent = Split-Path -Parent $Destination
    if (-not $parent) { $parent = (Get-Location).Path }
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $tempRoot = Join-Path $parent (".pc-stage-" + [guid]::NewGuid().ToString("N"))
    $archive = Join-Path $tempRoot "pi_config.zip"
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    try {
        Invoke-WebRequest -Uri $ArchiveUrl -OutFile $archive -TimeoutSec 600 -UseBasicParsing
        Expand-ZipArchive -ArchivePath $archive -DestinationPath $tempRoot
        $source = Get-ChildItem -Path $tempRoot -Directory | Select-Object -First 1
        if (-not $source -or -not (Test-Path (Join-Path $source.FullName "install.mjs"))) {
            throw "The downloaded archive does not contain install.mjs."
        }
        Switch-Repository -Source $source.FullName -Destination $Destination
    } finally {
        if (Test-Path $tempRoot) {
            Remove-Item -Path $tempRoot -Recurse -Force
        }
    }
}

function Find-Repository([bool]$AllowDownload = $true) {
    if ($PSScriptRoot -and
        (Test-Path (Join-Path $PSScriptRoot "install.mjs")) -and
        (Test-Path (Join-Path $PSScriptRoot "config"))) {
        return $PSScriptRoot
    }

    $hasRepository = (
        (Test-Path (Join-Path $PiConfigHome "install.mjs")) -and
        (Test-Path (Join-Path $PiConfigHome "config"))
    )
    if ($hasRepository) {
        if ($AllowDownload -and -not (Test-Path (Join-Path $PiConfigHome ".git"))) {
            Sync-Repository $PiConfigHome
        }
        return $PiConfigHome
    }

    if (-not $AllowDownload) {
        throw "Dry-run requires an existing local pi_config checkout."
    }

    if (Test-Path $PiConfigHome) {
        throw "$PiConfigHome exists but is not a complete pi_config checkout. Move it, then rerun."
    }

    Sync-Repository $PiConfigHome
    return $PiConfigHome
}

if ($TestArchiveUpdate) {
    $testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pc-archive-test-" + [guid]::NewGuid().ToString("N"))
    try {
        $destination = Join-Path $testRoot "checkout"
        $staged = Join-Path $testRoot "staged"
        New-Item -ItemType Directory -Path (Join-Path $destination "extensions\pi-retired") -Force | Out-Null
        Set-Content -Path (Join-Path $destination "install.mjs") -Value "old entry" -NoNewline
        Set-Content -Path (Join-Path $destination "extensions\pi-retired\package.json") -Value "old package" -NoNewline
        New-Item -ItemType Directory -Path $staged -Force | Out-Null
        Set-Content -Path (Join-Path $staged "install.mjs") -Value "new entry" -NoNewline
        Switch-Repository -Source $staged -Destination $destination
        if ((Get-Content (Join-Path $destination "install.mjs") -Raw) -ne "new entry") { throw "staged entry was not installed" }
        if (Test-Path (Join-Path $destination "extensions\pi-retired")) { throw "retired package survived archive refresh" }
        $backup = Get-ChildItem -Path $testRoot -Directory -Filter "checkout.backup-*" | Select-Object -First 1
        if (-not $backup -or (Get-Content (Join-Path $backup.FullName "extensions\pi-retired\package.json") -Raw) -ne "old package") { throw "old repository was not preserved as backup" }

        $failureDestination = Join-Path $testRoot "failure-checkout"
        New-Item -ItemType Directory -Path $failureDestination -Force | Out-Null
        Set-Content -Path (Join-Path $failureDestination "install.mjs") -Value "preserve me" -NoNewline
        try {
            Switch-Repository -Source (Join-Path $testRoot "missing-stage") -Destination $failureDestination
            throw "injected switch failure unexpectedly succeeded"
        } catch {
            if ($_.Exception.Message -eq "injected switch failure unexpectedly succeeded") { throw }
        }
        if ((Get-Content (Join-Path $failureDestination "install.mjs") -Raw) -ne "preserve me") { throw "failed switch did not restore the old repository" }
        Write-Host "Windows archive update regression tests passed"
    } finally {
        if (Test-Path $testRoot) { Remove-Item -Path $testRoot -Recurse -Force }
    }
    exit 0
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
if ($WithRtk) { $installerArgs += "--with-rtk" }
if ($SkipRtk) { $installerArgs += "--skip-rtk" }
if ($WithModelDefaults) { $installerArgs += "--with-model-defaults" }
if ($SkipModelDefaults) { $installerArgs += "--skip-model-defaults" }
if ($CleanPlugins) { $installerArgs += "--clean-plugins" }

Write-Step "Running the pi_config installer"
& node (Join-Path $repository "install.mjs") @installerArgs
if ($LASTEXITCODE -ne 0) {
    throw "pi_config installation failed (exit code $LASTEXITCODE)."
}
Update-ProcessPath
