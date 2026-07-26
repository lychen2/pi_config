#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Version = $env:RTK_VERSION
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repository = "rtk-ai/rtk"
$AssetName = "rtk-x86_64-pc-windows-msvc.zip"
$InstallDir = Join-Path $HOME ".local\bin"
$Destination = Join-Path $InstallDir "rtk.exe"
$Headers = @{
    Accept = "application/vnd.github+json"
    "User-Agent" = "pi-config-installer"
}

if ($Version) {
    if (-not $Version.StartsWith("v")) {
        $Version = "v$Version"
    }
    $ReleaseUri = "https://api.github.com/repos/$Repository/releases/tags/$Version"
} else {
    $ReleaseUri = "https://api.github.com/repos/$Repository/releases/latest"
}

Write-Host "Resolving the RTK Windows release..."
$Release = Invoke-RestMethod -Uri $ReleaseUri -Headers $Headers -UseBasicParsing
$ArchiveAsset = $Release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
$ChecksumsAsset = $Release.assets | Where-Object { $_.name -eq "checksums.txt" } | Select-Object -First 1
if (-not $ArchiveAsset) {
    throw "RTK release $($Release.tag_name) has no $AssetName asset."
}
if (-not $ChecksumsAsset) {
    throw "RTK release $($Release.tag_name) has no checksums.txt asset."
}

$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("pi-config-rtk-" + [guid]::NewGuid())
$ArchivePath = Join-Path $TempRoot $AssetName
$ChecksumsPath = Join-Path $TempRoot "checksums.txt"
$ExtractPath = Join-Path $TempRoot "extracted"
New-Item -ItemType Directory -Path $TempRoot | Out-Null

try {
    Write-Host "Downloading RTK $($Release.tag_name)..."
    Invoke-WebRequest -Uri $ArchiveAsset.browser_download_url -OutFile $ArchivePath -UseBasicParsing
    Invoke-WebRequest -Uri $ChecksumsAsset.browser_download_url -OutFile $ChecksumsPath -UseBasicParsing

    $ChecksumLine = Get-Content $ChecksumsPath |
        Where-Object { $_ -match ("\s+" + [regex]::Escape($AssetName) + "$") } |
        Select-Object -First 1
    if (-not $ChecksumLine) {
        throw "checksums.txt has no entry for $AssetName."
    }

    $ExpectedHash = ($ChecksumLine.Trim() -split "\s+")[0].ToLowerInvariant()
    $ActualHash = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ExpectedHash -ne $ActualHash) {
        throw "RTK checksum mismatch: expected $ExpectedHash, got $ActualHash."
    }

    Expand-Archive -Path $ArchivePath -DestinationPath $ExtractPath -Force
    $Binary = Get-ChildItem -Path $ExtractPath -Filter "rtk.exe" -File -Recurse | Select-Object -First 1
    if (-not $Binary) {
        throw "$AssetName does not contain rtk.exe."
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path $Binary.FullName -Destination $Destination -Force

    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $PathEntries = @($UserPath -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if (-not ($PathEntries | Where-Object { $_.TrimEnd("\") -ieq $InstallDir.TrimEnd("\") })) {
        $NewUserPath = (@($PathEntries) + $InstallDir) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
    }
    if (-not (($env:Path -split ";") | Where-Object { $_.TrimEnd("\") -ieq $InstallDir.TrimEnd("\") })) {
        $env:Path = "$InstallDir;$env:Path"
    }

    & $Destination --version
    if ($LASTEXITCODE -ne 0) {
        throw "Installed rtk.exe failed its version check."
    }
    Write-Host "RTK installed at $Destination"
} finally {
    if (Test-Path $TempRoot) {
        Remove-Item -Path $TempRoot -Recurse -Force
    }
}
