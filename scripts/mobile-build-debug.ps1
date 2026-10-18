[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$ApiBaseUrl,

    [string]$JdkHome = 'E:\development\Java\microsoft-jdk-21\jdk-21.0.12.1+1',

    [string]$AndroidSdkRoot = 'E:\development\Android\sdk'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $repositoryRoot 'web'
$javaExecutable = Join-Path $JdkHome 'bin\java.exe'
$adbExecutable = Join-Path $AndroidSdkRoot 'platform-tools\adb.exe'
$apkPath = Join-Path $webRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$generatedConfigPath = Join-Path $webRoot 'android\app\src\main\assets\capacitor.config.json'
$mobileIndexPath = Join-Path $webRoot 'mobile-dist\index.html'
$apiUri = [Uri]$ApiBaseUrl
$expectedApiBaseUrl = $apiUri.GetLeftPart([System.UriPartial]::Authority)

if ($apiUri.AbsolutePath -ne '/' -or $apiUri.Query -or $apiUri.Fragment -or $apiUri.UserInfo) {
    throw 'ApiBaseUrl must contain only an HTTPS origin without a path, credentials, query, or fragment.'
}
if (-not (Test-Path -LiteralPath $javaExecutable)) {
    throw "JDK executable not found: $javaExecutable"
}
if (-not (Test-Path -LiteralPath $adbExecutable)) {
    throw "Android SDK platform-tools not found: $adbExecutable"
}

function Assert-LocalCapacitorConfig {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Config,

        [Parameter(Mandatory = $true)]
        [string]$Source
    )

    if ($Config.webDir -ne 'mobile-dist') {
        throw "$Source does not use the packaged mobile-dist client."
    }
    if ($Config.PSObject.Properties.Name -contains 'server') {
        throw "$Source unexpectedly contains Capacitor server.url."
    }
}

$previousJavaHome = $env:JAVA_HOME
$previousAndroidHome = $env:ANDROID_HOME
$previousAndroidSdkRoot = $env:ANDROID_SDK_ROOT
$previousApiBaseUrl = $env:VITE_API_BASE_URL

Push-Location $webRoot
try {
    $env:JAVA_HOME = $JdkHome
    $env:ANDROID_HOME = $AndroidSdkRoot
    $env:ANDROID_SDK_ROOT = $AndroidSdkRoot
    $env:VITE_API_BASE_URL = $expectedApiBaseUrl

    npm run mobile:sync
    if ($LASTEXITCODE -ne 0) { throw 'Local mobile client build or Capacitor sync failed.' }
    if (-not (Test-Path -LiteralPath $mobileIndexPath)) {
        throw "Local mobile build did not create: $mobileIndexPath"
    }
    if (-not (Test-Path -LiteralPath $generatedConfigPath)) {
        throw "Capacitor sync did not create: $generatedConfigPath"
    }
    $generatedConfig = Get-Content -Raw -LiteralPath $generatedConfigPath | ConvertFrom-Json
    Assert-LocalCapacitorConfig -Config $generatedConfig -Source 'Generated Capacitor config'

    npm run mobile:build:debug
    if ($LASTEXITCODE -ne 0) { throw 'Android Debug APK build failed.' }
    if (-not (Test-Path -LiteralPath $apkPath)) {
        throw "Build completed without the expected APK: $apkPath"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
    try {
        $configEntry = $archive.GetEntry('assets/capacitor.config.json')
        $indexEntry = $archive.GetEntry('assets/public/index.html')
        if ($null -eq $configEntry -or $null -eq $indexEntry) {
            throw 'Built APK is missing the Capacitor config or local React index.html.'
        }
        $reader = [System.IO.StreamReader]::new($configEntry.Open())
        try {
            $packagedConfig = $reader.ReadToEnd() | ConvertFrom-Json
        }
        finally {
            $reader.Dispose()
        }
        Assert-LocalCapacitorConfig -Config $packagedConfig -Source 'Built APK config'

        $containsApiBaseUrl = $false
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -notlike 'assets/public/assets/*.js') { continue }
            $assetReader = [System.IO.StreamReader]::new($entry.Open())
            try {
                if ($assetReader.ReadToEnd().Contains($expectedApiBaseUrl)) {
                    $containsApiBaseUrl = $true
                    break
                }
            }
            finally {
                $assetReader.Dispose()
            }
        }
        if (-not $containsApiBaseUrl) {
            throw 'Built APK local client does not contain the expected API Base URL.'
        }
    }
    finally {
        $archive.Dispose()
    }

    $apk = Get-Item -LiteralPath $apkPath
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath
    Write-Host "Local-client Debug APK: $($apk.FullName)"
    Write-Host "API Base URL: $expectedApiBaseUrl"
    Write-Host "Size: $($apk.Length) bytes"
    Write-Host "SHA256: $($hash.Hash)"
}
finally {
    if ($null -eq $previousJavaHome) { Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue }
    else { $env:JAVA_HOME = $previousJavaHome }
    if ($null -eq $previousAndroidHome) { Remove-Item Env:ANDROID_HOME -ErrorAction SilentlyContinue }
    else { $env:ANDROID_HOME = $previousAndroidHome }
    if ($null -eq $previousAndroidSdkRoot) { Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue }
    else { $env:ANDROID_SDK_ROOT = $previousAndroidSdkRoot }
    if ($null -eq $previousApiBaseUrl) { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue }
    else { $env:VITE_API_BASE_URL = $previousApiBaseUrl }
    Pop-Location
}
